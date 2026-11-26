import { publicResourceStatusCondition, toResource, type ResourceRow } from "../_shared/resources"

async function loadFacets(db: D1Database) {
  const types = await db.prepare(`
    SELECT value FROM (
      SELECT category AS value FROM resources WHERE ${publicResourceStatusCondition} AND category != ''
      UNION
      SELECT item.value AS value FROM resources, json_each(resources.file_types) AS item WHERE ${publicResourceStatusCondition}
    ) ORDER BY value
  `).all<{ value: string }>()
  return {
    types: types.results.map((row) => row.value),
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120)
  const type = url.searchParams.get("type")
  const category = url.searchParams.get("category")
  const fileType = url.searchParams.get("fileType")
  const sort = url.searchParams.get("sort")
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1))
  const pageSize = Math.min(24, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "12", 10) || 12))

  const conditions: string[] = [publicResourceStatusCondition]
  const bindings: (string | number)[] = []
  if (query) {
    conditions.push(`(
      instr(lower(title), lower(?)) > 0
      OR instr(lower(submitted_by), lower(?)) > 0
      OR instr(lower(coalesce(from_mod, '')), lower(?)) > 0
      OR instr(lower(coalesce(original_by, '')), lower(?)) > 0
      OR instr(lower(coalesce(recreation_by, '')), lower(?)) > 0
      OR EXISTS (SELECT 1 FROM json_each(resources.tags) WHERE instr(lower(value), lower(?)) > 0)
    )`)
    bindings.push(query, query, query, query, query, query)
  }
  if (type) {
    conditions.push("(category = ? OR EXISTS (SELECT 1 FROM json_each(resources.file_types) WHERE value = ?))")
    bindings.push(type, type)
  } else if (category) {
    conditions.push("category = ?")
    bindings.push(category)
  }
  if (!type && fileType) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(resources.file_types) WHERE value = ?)")
    bindings.push(fileType)
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
  const orderByOptions: Record<string, string> = {
    newest: "created_at DESC",
    oldest: "created_at ASC",
    updated: "updated_at DESC",
    "least-updated": "updated_at ASC",
    alphabetical: "title COLLATE NOCASE ASC",
    "reverse-alphabetical": "title COLLATE NOCASE DESC",
  }
  const orderBy = orderByOptions[sort ?? "newest"] ?? orderByOptions.newest
  const [count, facets] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM resources ${where}`).bind(...bindings).first<{ total: number }>(),
    loadFacets(env.DB),
  ])

  const total = count?.total ?? 0
  const pageCount = Math.ceil(total / pageSize)
  const currentPage = pageCount > 0 ? Math.min(page, pageCount) : 1
  const offset = (currentPage - 1) * pageSize
  const rows = await env.DB.prepare(`
    SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image, submitter.username AS account_submitter_username
    FROM resources
    LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, offset).all<ResourceRow>()

  return Response.json({
    resources: rows.results.map(toResource),
    total,
    page: currentPage,
    pageSize,
    pageCount,
    facets,
  }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } })
}
