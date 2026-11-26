import { createAuth, type AuthEnv } from "../../../_shared/auth"
import { accountImageKeyFromUrl } from "../../../_shared/account-assets"
import { toResource, type ResourceRow } from "../../../_shared/resources"

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

async function getOwnedResource(slug: unknown, userId: string, env: Env) {
  if (typeof slug !== "string" || !slug) return null
  return env.DB.prepare(`
    SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image
    FROM resources
    LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
    WHERE resources.slug = ? AND resources.submitted_by_user_id = ?
    LIMIT 1
  `).bind(slug, userId).first<ResourceRow>()
}

async function requireSession(request: Request, env: AuthEnv, waitUntil: (promise: Promise<unknown>) => void) {
  const auth = createAuth(env, request, waitUntil)
  return auth.api.getSession({ headers: request.headers })
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  const session = await requireSession(request, env, waitUntil)
  if (!session) return Response.json({ message: "Log in to edit a resource." }, { status: 401 })
  const row = await getOwnedResource(params.slug, session.user.id, env)
  if (!row) return Response.json({ message: "That resource was not found in your submissions." }, { status: 404 })
  return Response.json({ resource: toResource(row) }, { headers: { "Cache-Control": "private, no-store" } })
}

export const onRequestPut: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Update request origin was not allowed." }, { status: 403 })
  }
  const session = await requireSession(request, env, waitUntil)
  if (!session) return Response.json({ message: "Log in to edit a resource." }, { status: 401 })
  const row = await getOwnedResource(params.slug, session.user.id, env)
  if (!row) return Response.json({ message: "That resource was not found in your submissions." }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "The resource data could not be read." }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "The resource data is invalid." }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const title = optionalText(input.title)
  const type = optionalText(input.type)
  const version = optionalText(input.version) ?? ""
  const fromMod = optionalText(input.fromMod)
  const originalBy = optionalText(input.originalBy)
  const recreationBy = optionalText(input.recreationBy)
  const description = optionalText(input.description) ?? ""
  const downloadValue = input.downloadUrl
  const oldDownloadUrl = row.download_key ? `/api/assets?key=${encodeURIComponent(row.download_key)}&download=1` : null
  const keepExistingDownload = typeof downloadValue === "string" && downloadValue === oldDownloadUrl
  const downloadUrl = keepExistingDownload ? row.download_url : optionalUrl(downloadValue)
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))]
    : []
  const alternateDownloads = Array.isArray(input.alternateDownloads)
    ? [...new Set(input.alternateDownloads.map(optionalUrl))]
    : []

  if (!title) return Response.json({ message: "Enter a resource title." }, { status: 400 })
  if (!type || !allowedResourceTypes.includes(type)) return Response.json({ message: "Choose a supported resource type." }, { status: 400 })
  if (downloadUrl === false) return Response.json({ message: "Enter a valid HTTP or HTTPS download URL." }, { status: 400 })
  if (alternateDownloads.some((url) => url === false)) return Response.json({ message: "Enter valid HTTP or HTTPS alternative download URLs." }, { status: 400 })
  if (alternateDownloads.length > 10) return Response.json({ message: "Add no more than 10 alternative downloads." }, { status: 400 })

  let coverKey = row.cover_key
  let coverUrl = row.cover_url
  if (Object.prototype.hasOwnProperty.call(input, "coverUrl")) {
    const coverValue = input.coverUrl
    if (coverValue == null || coverValue === "") {
      coverKey = null
      coverUrl = null
    } else if (typeof coverValue === "string") {
      const nextCoverKey = accountImageKeyFromUrl(coverValue, session.user.id)
      if (!nextCoverKey) return Response.json({ message: "Upload a valid cover image before saving." }, { status: 400 })
      coverKey = nextCoverKey
      coverUrl = null
    } else {
      return Response.json({ message: "Upload a valid cover image before saving." }, { status: 400 })
    }
  }

  await env.DB.prepare(`
    UPDATE resources
    SET title = ?, version = ?, submitted_by = ?, from_mod = ?, original_by = ?,
      recreation_by = ?, description = ?, category = ?, tags = ?, file_types = ?,
      cover_key = ?, cover_url = ?, download_key = ?, download_url = ?, alternate_downloads = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND submitted_by_user_id = ?
  `).bind(
    title,
    version,
    session.user.name || "Member",
    fromMod,
    originalBy,
    recreationBy,
    description,
    type,
    JSON.stringify(tags),
    JSON.stringify([type]),
    coverKey,
    coverUrl,
    keepExistingDownload ? row.download_key : null,
    keepExistingDownload ? row.download_url : downloadUrl,
    JSON.stringify(alternateDownloads.filter((url): url is string => typeof url === "string")),
    row.id,
    session.user.id,
  ).run()

  const updatedRow = await env.DB.prepare(`
    SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image
    FROM resources
    LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
    WHERE resources.id = ?
    LIMIT 1
  `).bind(row.id).first<ResourceRow>()
  if (!updatedRow) return Response.json({ message: "The resource was saved but could not be loaded." }, { status: 500 })
  return Response.json({ resource: toResource(updatedRow) }, { headers: { "Cache-Control": "private, no-store" } })
}
