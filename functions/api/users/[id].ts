import { publicResourceStatusCondition, toResource, type ResourceRow } from "../../_shared/resources"
import { ensureUsername } from "../../_shared/usernames"

interface PublicUserRow {
  id: string
  username: string | null
  name: string
  image: string | null
  bio: string
  banner: string | null
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const usernameOrId = params.id
  if (typeof usernameOrId !== "string" || !usernameOrId) return Response.json({ error: "Profile not found." }, { status: 404 })

  const user = await env.DB.prepare(`SELECT id, username, name, image, bio, banner FROM "user" WHERE username = ? COLLATE NOCASE OR id = ? LIMIT 1`)
    .bind(usernameOrId, usernameOrId)
    .first<PublicUserRow>()
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 })
  user.username = user.username ?? await ensureUsername(env.DB, user.id, user.name)

  const preview = new URL(request.url).searchParams.get("preview") === "1"
  if (preview) {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM resources WHERE ${publicResourceStatusCondition} AND submitted_by_user_id = ?`)
      .bind(user.id)
      .first<{ total: number }>()
    return Response.json({ profile: { ...user, total: Number(count?.total ?? 0) } }, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    })
  }

  const searchParams = new URL(request.url).searchParams
  const query = (searchParams.get("q") ?? "").trim().slice(0, 120)
  const type = searchParams.get("type")
  const requestedRating = Number(searchParams.get("minRating"))
  const minRating = Number.isFinite(requestedRating) && requestedRating >= 0 && requestedRating <= 5 && Number.isInteger(requestedRating * 2) ? requestedRating : 0
  const requestedPage = Math.min(1_000_000, Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1))
  const pageSize = Math.min(24, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "24", 10) || 24))
  const conditions = [publicResourceStatusCondition, "resources.submitted_by_user_id = ?"]
  const bindings: (string | number)[] = [user.id]
  if (query) {
    conditions.push(`(
      instr(lower(resources.title), lower(?)) > 0
      OR instr(lower(coalesce(resources.from_mod, '')), lower(?)) > 0
      OR instr(lower(coalesce(resources.original_by, '')), lower(?)) > 0
      OR instr(lower(coalesce(resources.recreation_by, '')), lower(?)) > 0
      OR EXISTS (SELECT 1 FROM json_each(resources.tags) WHERE instr(lower(value), lower(?)) > 0)
    )`)
    bindings.push(query, query, query, query, query)
  }
  if (type) {
    conditions.push("(resources.category = ? OR EXISTS (SELECT 1 FROM json_each(resources.file_types) WHERE value = ?))")
    bindings.push(type, type)
  }
  if (minRating) {
    conditions.push("COALESCE(rating_summary.average_rating, 0) >= ?")
    bindings.push(minRating)
  }
  const where = `WHERE ${conditions.join(" AND ")}`
  const orderByOptions: Record<string, string> = {
    newest: "resources.created_at DESC",
    oldest: "resources.created_at ASC",
    updated: "resources.updated_at DESC",
    "least-updated": "resources.updated_at ASC",
    alphabetical: "resources.title COLLATE NOCASE ASC",
    "reverse-alphabetical": "resources.title COLLATE NOCASE DESC",
    "highest-rated": "COALESCE(rating_summary.average_rating, 0) DESC, COALESCE(rating_summary.rating_count, 0) DESC, resources.created_at DESC",
    "most-rated": "COALESCE(rating_summary.rating_count, 0) DESC, COALESCE(rating_summary.average_rating, 0) DESC, resources.created_at DESC",
  }
  const orderBy = orderByOptions[searchParams.get("sort") ?? "newest"] ?? orderByOptions.newest
  const ratingJoin = `LEFT JOIN (
    SELECT resource_id, AVG(rating) AS average_rating, COUNT(*) AS rating_count
    FROM resource_ratings GROUP BY resource_id
  ) AS rating_summary ON rating_summary.resource_id = resources.id`

  const [count, typeRows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM resources ${ratingJoin} ${where}`)
      .bind(...bindings)
      .first<{ total: number }>(),
    env.DB.prepare(`
      SELECT value FROM (
        SELECT category AS value FROM resources WHERE ${publicResourceStatusCondition} AND submitted_by_user_id = ? AND category != ''
        UNION
        SELECT item.value AS value FROM resources, json_each(resources.file_types) AS item
        WHERE ${publicResourceStatusCondition} AND submitted_by_user_id = ?
      ) ORDER BY value
    `).bind(user.id, user.id).all<{ value: string }>(),
  ])
  const total = Number(count?.total ?? 0)
  const pageCount = Math.ceil(total / pageSize)
  const page = pageCount > 0 ? Math.min(Math.max(1, requestedPage), pageCount) : 1
  const rows = await env.DB.prepare(`
    SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image,
      submitter.username AS account_submitter_username, rating_summary.average_rating AS rating_average,
      rating_summary.rating_count AS rating_count
    FROM resources
    LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
    ${ratingJoin}
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, (page - 1) * pageSize).all<ResourceRow>()

  return Response.json({
    profile: {
      ...user,
      resources: rows.results.map(toResource),
      total,
      page,
      pageSize,
      pageCount,
      facets: { types: typeRows.results.map((row) => row.value) },
    },
  }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } })
}
