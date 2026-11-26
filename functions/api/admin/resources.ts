import { getAdminUser } from "../../_shared/admin"
import type { AuthEnv } from "../../_shared/auth"
import { toResource, type ResourceRow } from "../../_shared/resources"

const statusConditions: Record<string, string> = {
  pending: "lower(trim(status)) = 'pending'",
  accepted: "trim(status) = '' OR lower(trim(status)) IN ('accepted', 'approved')",
  rejected: "lower(trim(status)) = 'rejected'",
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const user = await getAdminUser(request, env, waitUntil)
  if (!user) return Response.json({ message: "Admin access is required." }, { status: 403 })

  const url = new URL(request.url)
  const status = url.searchParams.get("status") ?? "pending"
  const condition = statusConditions[status]
  if (!condition) return Response.json({ message: "Choose a valid approval status." }, { status: 400 })
  const page = Math.max(1, Math.min(1_000_000, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1))
  const pageSize = 20
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120)
  const type = url.searchParams.get("type")
  const requestedRating = Number(url.searchParams.get("minRating"))
  const minRating = Number.isFinite(requestedRating) && requestedRating >= 0 && requestedRating <= 5 && Number.isInteger(requestedRating * 2) ? requestedRating : 0
  const conditions = [`(${condition})`]
  const bindings: (string | number)[] = []
  if (query) {
    conditions.push(`(
      instr(lower(resources.title), lower(?)) > 0
      OR instr(lower(coalesce(submitter.name, resources.submitted_by)), lower(?)) > 0
      OR instr(lower(coalesce(resources.from_mod, '')), lower(?)) > 0
      OR instr(lower(coalesce(resources.original_by, '')), lower(?)) > 0
      OR instr(lower(coalesce(resources.recreation_by, '')), lower(?)) > 0
      OR EXISTS (SELECT 1 FROM json_each(resources.tags) WHERE instr(lower(value), lower(?)) > 0)
    )`)
    bindings.push(query, query, query, query, query, query)
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
  const sort = url.searchParams.get("sort")
  const orderByOptions: Record<string, string> = {
    newest: "resources.created_at DESC",
    oldest: "resources.created_at ASC",
    alphabetical: "resources.title COLLATE NOCASE ASC",
    "reverse-alphabetical": "resources.title COLLATE NOCASE DESC",
    "highest-rated": "COALESCE(rating_summary.average_rating, 0) DESC, COALESCE(rating_summary.rating_count, 0) DESC, resources.created_at DESC",
    "lowest-rated": "CASE WHEN COALESCE(rating_summary.rating_count, 0) = 0 THEN 1 ELSE 0 END ASC, rating_summary.average_rating ASC, resources.created_at DESC",
    "most-rated": "COALESCE(rating_summary.rating_count, 0) DESC, COALESCE(rating_summary.average_rating, 0) DESC, resources.created_at DESC",
  }
  const orderBy = orderByOptions[sort ?? "newest"] ?? orderByOptions.newest
  const ratingJoin = `LEFT JOIN (
    SELECT resource_id, AVG(rating) AS average_rating, COUNT(*) AS rating_count
    FROM resource_ratings GROUP BY resource_id
  ) AS rating_summary ON rating_summary.resource_id = resources.id`
  const [count, counts, typeRows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM resources LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id ${ratingJoin} ${where}`).bind(...bindings).first<{ total: number }>(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN lower(trim(status)) = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN trim(status) = '' OR lower(trim(status)) IN ('accepted', 'approved') THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN lower(trim(status)) = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM resources`).first<{ pending: number | null; accepted: number | null; rejected: number | null }>(),
    env.DB.prepare(`SELECT value FROM (
      SELECT category AS value FROM resources WHERE category != ''
      UNION SELECT item.value AS value FROM resources, json_each(resources.file_types) AS item
    ) ORDER BY value`).all<{ value: string }>(),
  ])

  const total = Number(count?.total ?? 0)
  const pageCount = Math.ceil(total / pageSize)
  const currentPage = pageCount ? Math.min(page, pageCount) : 1
  const result = await env.DB.prepare(`SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image,
      submitter.username AS account_submitter_username, rating_summary.average_rating AS rating_average,
      rating_summary.rating_count AS rating_count
    FROM resources
    LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
    ${ratingJoin}
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`).bind(...bindings, pageSize, (currentPage - 1) * pageSize).all<ResourceRow>()
  return Response.json({
    resources: result.results.map(toResource),
    total,
    page: currentPage,
    pageSize,
    pageCount,
    counts: { pending: Number(counts?.pending ?? 0), accepted: Number(counts?.accepted ?? 0), rejected: Number(counts?.rejected ?? 0) },
    facets: { types: typeRows.results.map((row) => row.value) },
  }, { headers: { "Cache-Control": "private, no-store" } })
}
