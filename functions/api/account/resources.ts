import { createAuth, type AuthEnv } from "../../_shared/auth"
import { accountImageKeyFromUrl } from "../../_shared/account-assets"
import { toResource, type ResourceRow } from "../../_shared/resources"
import { readModerationSettings } from "../../_shared/admin"

const allowedResourceTypes = ["Chroms", "DWPs", "FLAs", "FLMs", "FLPs", "MIDIs", "SF2s", "Other"]

function optionalText(value: unknown): string | null {
  if (value == null || value === "") return null
  return typeof value === "string" ? value.trim() || null : null
}

function optionalUrl(value: unknown): string | null | false {
  const text = optionalText(value)
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : false
  } catch {
    return false
  }
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ message: "You must be signed in to view your submissions." }, { status: 401 })

  const params = new URL(request.url).searchParams
  const query = (params.get("q") ?? "").trim().slice(0, 120)
  const type = params.get("type")
  const requestedRating = Number(params.get("minRating"))
  const minRating = Number.isFinite(requestedRating) && requestedRating >= 0 && requestedRating <= 5 && Number.isInteger(requestedRating * 2) ? requestedRating : 0
  const requestedPage = Math.min(1_000_000, Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1))
  const pageSize = Math.min(24, Math.max(1, Number.parseInt(params.get("limit") ?? "24", 10) || 24))
  const conditions = ["resources.submitted_by_user_id = ?"]
  const bindings: (string | number)[] = [session.user.id]
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
  const orderBy = orderByOptions[params.get("sort") ?? "newest"] ?? orderByOptions.newest
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
        SELECT category AS value FROM resources WHERE submitted_by_user_id = ? AND category != ''
        UNION
        SELECT item.value AS value FROM resources, json_each(resources.file_types) AS item WHERE submitted_by_user_id = ?
      ) ORDER BY value
    `).bind(session.user.id, session.user.id).all<{ value: string }>(),
  ])

  const total = Number(count?.total ?? 0)
  const pageCount = Math.ceil(total / pageSize)
  const page = pageCount > 0 ? Math.min(requestedPage, pageCount) : 1
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

  return Response.json({ resources: rows.results.map(toResource), total, page, pageSize, pageCount, facets: { types: typeRows.results.map((row) => row.value) } }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Submission request origin was not allowed." }, { status: 403 })
  }

  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ message: "Log in to submit a resource." }, { status: 401 })
  const moderationSettings = await readModerationSettings(env.DB)
  if (moderationSettings.submissionsLocked) {
    return Response.json({ message: "New submissions are temporarily locked. Please try again later." }, { status: 423 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "The submission data could not be read." }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "The submission data is invalid." }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const title = optionalText(input.title)
  const type = optionalText(input.type)
  const version = optionalText(input.version) ?? ""
  const fromMod = optionalText(input.fromMod)
  const originalBy = optionalText(input.originalBy)
  const recreationBy = optionalText(input.recreationBy)
  const description = optionalText(input.description) ?? ""
  const coverImageUrl = optionalText(input.coverUrl)
  const coverKey = coverImageUrl ? accountImageKeyFromUrl(coverImageUrl, session.user.id) : null
  const downloadUrl = optionalUrl(input.downloadUrl)
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))]
    : []
  const alternateDownloads = Array.isArray(input.alternateDownloads)
    ? [...new Set(input.alternateDownloads.map(optionalUrl))]
    : []

  if (!title) return Response.json({ message: "Enter a resource title." }, { status: 400 })
  if (!type || !allowedResourceTypes.includes(type)) return Response.json({ message: "Choose a supported resource type." }, { status: 400 })
  if (coverImageUrl && !coverKey) return Response.json({ message: "Upload a valid cover image before submitting." }, { status: 400 })
  if (downloadUrl === false) return Response.json({ message: "Enter a valid HTTP or HTTPS download URL." }, { status: 400 })
  if (alternateDownloads.some((url) => url === false)) return Response.json({ message: "Enter valid HTTP or HTTPS alternative download URLs." }, { status: 400 })
  if (alternateDownloads.length > 10) return Response.json({ message: "Add no more than 10 alternative downloads." }, { status: 400 })

  const id = crypto.randomUUID()
  const slugBase = title.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "resource"
  const slug = `${slugBase}-${id.slice(0, 8)}`

  try {
    await env.DB.prepare(`
      INSERT INTO resources (
        id, slug, title, version, submitted_by, submitted_by_user_id,
        from_mod, original_by, recreation_by, description, category, status,
        tags, file_types, cover_key, cover_url, download_url, alternate_downloads
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      slug,
      title,
      version,
      session.user.name || "Member",
      session.user.id,
      fromMod,
      originalBy,
      recreationBy,
      description,
      type,
      moderationSettings.autoApproval ? "accepted" : "pending",
      JSON.stringify(tags),
      JSON.stringify([type]),
      coverKey,
      null,
      downloadUrl,
      JSON.stringify(alternateDownloads.filter((url): url is string => typeof url === "string")),
    ).run()

    const row = await env.DB.prepare(`
      SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image, submitter.username AS account_submitter_username
      FROM resources
      LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
      WHERE resources.id = ?
    `).bind(id).first<ResourceRow>()
    if (!row) return Response.json({ message: "The resource was saved but could not be loaded." }, { status: 500 })

    return Response.json({ resource: toResource(row) }, { status: 201, headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ message: "The resource could not be saved. Try again." }, { status: 500 })
  }
}
