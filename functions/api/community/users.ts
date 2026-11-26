import { publicResourceStatusCondition } from "../../_shared/resources"

interface PersonRow {
  id: string
  username: string | null
  name: string
  image: string | null
  bio: string
  banner: string | null
  submission_count: number
  latest_resource_title: string | null
  latest_resource_cover_key: string | null
  latest_resource_cover_url: string | null
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const params = new URL(request.url).searchParams
  const query = (params.get("q") ?? "").trim().slice(0, 100)
  const requestedSort = params.get("sort")
  const sort = requestedSort === "all" || requestedSort === "recent" ? requestedSort : "contributors"
  const requestedPage = Math.min(1_000_000, Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1))
  const pageSize = Math.min(36, Math.max(1, Number.parseInt(params.get("limit") ?? "24", 10) || 24))
  const searchSql = query
    ? "AND (instr(lower(users.name), lower(?)) > 0 OR instr(lower(coalesce(users.username, '')), lower(?)) > 0 OR instr(lower(users.bio), lower(?)) > 0)"
    : ""
  const searchBindings = query ? [query, query, query] : []
  const contributionsCte = `WITH contributions AS (
      SELECT submitted_by_user_id AS user_id, COUNT(*) AS submission_count, MAX(created_at) AS latest_activity
      FROM resources
      WHERE ${publicResourceStatusCondition} AND submitted_by_user_id IS NOT NULL
      GROUP BY submitted_by_user_id
    )`
  const rowsCte = `${contributionsCte}, ranked_resources AS (
      SELECT submitted_by_user_id AS user_id, title, cover_key, cover_url,
        ROW_NUMBER() OVER (PARTITION BY submitted_by_user_id ORDER BY created_at DESC, id DESC) AS position
      FROM resources
      WHERE ${publicResourceStatusCondition} AND submitted_by_user_id IS NOT NULL
    )`
  const orderBy = sort === "all"
    ? "users.createdAt DESC, users.name COLLATE NOCASE ASC"
    : sort === "recent"
      ? "contributions.latest_activity DESC, contributions.submission_count DESC, users.name COLLATE NOCASE ASC"
      : "contributions.submission_count DESC, contributions.latest_activity DESC, users.name COLLATE NOCASE ASC"
  const contributionJoin = sort === "all" ? "LEFT JOIN contributions" : "JOIN contributions"

  const countQuery = sort === "all"
    ? `SELECT COUNT(*) AS total FROM "user" AS users WHERE 1 = 1 ${searchSql}`
    : `${contributionsCte} SELECT COUNT(*) AS total FROM "user" AS users JOIN contributions ON contributions.user_id = users.id WHERE 1 = 1 ${searchSql}`
  const count = await env.DB.prepare(countQuery)
    .bind(...searchBindings)
    .first<{ total: number }>()
  const total = Number(count?.total ?? 0)
  const pageCount = Math.ceil(total / pageSize)
  const page = pageCount > 0 ? Math.min(requestedPage, pageCount) : 1
  const rows = await env.DB.prepare(`${rowsCte}
      SELECT users.id, users.username, users.name, users.image, users.bio, users.banner,
        COALESCE(contributions.submission_count, 0) AS submission_count, ranked_resources.title AS latest_resource_title,
        ranked_resources.cover_key AS latest_resource_cover_key, ranked_resources.cover_url AS latest_resource_cover_url
      FROM "user" AS users
      ${contributionJoin} ON contributions.user_id = users.id
      LEFT JOIN ranked_resources ON ranked_resources.user_id = users.id AND ranked_resources.position = 1
      WHERE 1 = 1 ${searchSql}
      ORDER BY ${orderBy}, users.id ASC
      LIMIT ? OFFSET ?`)
    .bind(...searchBindings, pageSize, (page - 1) * pageSize)
    .all<PersonRow>()
  const people = rows.results.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    image: row.image,
    bio: row.bio,
    banner: row.banner,
    submissionCount: Number(row.submission_count),
    latestResourceTitle: row.latest_resource_title,
    latestResourceCoverKey: row.latest_resource_cover_key,
    latestResourceCoverUrl: row.latest_resource_cover_url,
  }))

  return Response.json({ people, total, page, pageSize, pageCount }, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  })
}
