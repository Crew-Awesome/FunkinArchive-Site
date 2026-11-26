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

  const [rows, count] = await Promise.all([
    env.DB.prepare(`
      SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image, submitter.username AS account_submitter_username
      FROM resources
      LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
      WHERE resources.submitted_by_user_id = ?
      ORDER BY resources.created_at DESC
      LIMIT 100
    `).bind(session.user.id).all<ResourceRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM resources WHERE submitted_by_user_id = ?`)
      .bind(session.user.id)
      .first<{ total: number }>(),
  ])

  return Response.json({ resources: rows.results.map(toResource), total: Number(count?.total ?? 0) }, {
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
