import { createAuth, type AuthEnv } from "../../../_shared/auth"
import { publicResourceStatusCondition } from "../../../_shared/resources"
import { userRestrictionResponse } from "../../../_shared/user-restrictions"

const reasonCodes = new Set([
  "leaked_private_content",
  "paid_download",
  "unrelated_resource",
  "credit_problem",
  "spam_duplicate_misleading",
  "community_safety",
  "unsafe_download",
  "broken_cover",
  "broken_download",
  "incorrect_details",
  "other",
])

const coverExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
])

function matchesImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (contentType === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  return contentType === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
}

function validReplacementUrl(value: string) {
  if (!value || value.length > 2048) return false
  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
  } catch {
    return false
  }
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, params, request, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Report request origin was not allowed." }, { status: 403 })
  }

  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ message: "Log in to report a resource." }, { status: 401 })
  const restriction = await userRestrictionResponse(env.DB, session.user.id, "community")
  if (restriction) return restriction

  const slug = params.slug
  if (typeof slug !== "string" || !slug) return Response.json({ message: "Resource not found." }, { status: 404 })
  const resource = await env.DB.prepare(`SELECT id FROM resources WHERE slug = ? AND ${publicResourceStatusCondition} LIMIT 1`)
    .bind(slug)
    .first<{ id: string }>()
  if (!resource) return Response.json({ message: "Resource not found." }, { status: 404 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ message: "Complete the report form and try again." }, { status: 400 })
  }

  const reasonCode = form.get("reasonCode")
  const detailsValue = form.get("details")
  const targetValue = form.get("targetField")
  const indexValue = form.get("targetIndex")
  const replacementValue = form.get("suggestedUrl")
  const imageValue = form.get("replacementImage")
  if (typeof reasonCode !== "string" || !reasonCodes.has(reasonCode)) {
    return Response.json({ message: "Choose a report reason." }, { status: 400 })
  }
  const details = typeof detailsValue === "string" ? detailsValue.trim().slice(0, 1500) : ""
  if (details.length < 10) return Response.json({ message: "Add at least 10 characters explaining the issue." }, { status: 400 })

  let targetField: "content" | "cover" | "download" | "alternate_download" | "metadata" = "content"
  let targetIndex: number | null = null
  if (reasonCode === "broken_cover") targetField = "cover"
  else if (reasonCode === "broken_download") {
    if (targetValue === "alternate_download") {
      const parsedIndex = typeof indexValue === "string" ? Number.parseInt(indexValue, 10) : Number.NaN
      const alternateRows = await env.DB.prepare("SELECT alternate_downloads FROM resources WHERE id = ?")
        .bind(resource.id)
        .first<{ alternate_downloads: string }>()
      let alternatives: unknown = []
      try { alternatives = JSON.parse(alternateRows?.alternate_downloads ?? "[]") } catch { /* Use an empty list for malformed legacy data. */ }
      if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || !Array.isArray(alternatives) || parsedIndex >= alternatives.length) {
        return Response.json({ message: "Choose a valid alternate download." }, { status: 400 })
      }
      targetField = "alternate_download"
      targetIndex = parsedIndex
    } else if (targetValue === "download") targetField = "download"
    else return Response.json({ message: "Choose which download is broken." }, { status: 400 })
  } else if (reasonCode === "incorrect_details") targetField = "metadata"

  const suggestedUrl = typeof replacementValue === "string" ? replacementValue.trim() : ""
  if (suggestedUrl && (!validReplacementUrl(suggestedUrl) || !["broken_cover", "broken_download"].includes(reasonCode))) {
    return Response.json({ message: "Enter a valid HTTP or HTTPS replacement URL." }, { status: 400 })
  }
  const replacementImage = imageValue instanceof File && imageValue.size > 0 ? imageValue : null
  if (replacementImage && reasonCode !== "broken_cover") {
    return Response.json({ message: "Replacement images can only be attached to a broken cover report." }, { status: 400 })
  }
  if (replacementImage && suggestedUrl) {
    return Response.json({ message: "Choose a replacement URL or upload an image, not both." }, { status: 400 })
  }

  if (replacementImage) {
    const extension = coverExtensions.get(replacementImage.type)
    if (!extension) return Response.json({ message: "Use a JPG, PNG, or WebP replacement image." }, { status: 400 })
    if (replacementImage.size > 5 * 1024 * 1024) return Response.json({ message: "Replacement images must be smaller than 5 MB." }, { status: 413 })
    const signature = new Uint8Array(await replacementImage.slice(0, 12).arrayBuffer())
    if (!matchesImageSignature(signature, replacementImage.type)) {
      return Response.json({ message: "The selected file does not match its image type." }, { status: 400 })
    }
  }

  const recentCount = await env.DB.prepare(`SELECT COUNT(*) AS total FROM resource_reports WHERE reporter_user_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`)
    .bind(session.user.id)
    .first<{ total: number }>()
  if (Number(recentCount?.total ?? 0) >= 5) return Response.json({ message: "You’ve sent several reports recently. Please try again later." }, { status: 429 })

  const duplicate = await env.DB.prepare(`
    SELECT id FROM resource_reports
    WHERE resource_id = ? AND reporter_user_id = ? AND reason_code = ? AND target_field = ? AND target_index IS ?
      AND status IN ('open', 'in_review')
    LIMIT 1
  `).bind(resource.id, session.user.id, reasonCode, targetField, targetIndex).first<{ id: string }>()
  if (duplicate) return Response.json({ message: "You’ve already reported this issue. Admins can see duplicate reports." }, { status: 409 })

  const reportId = crypto.randomUUID()
  let suggestedImageKey: string | null = null
  try {
    if (replacementImage) {
      suggestedImageKey = `report-suggestions/${reportId}.${coverExtensions.get(replacementImage.type)!}`
      await env.RESOURCE_ASSETS.put(suggestedImageKey, replacementImage.stream(), {
        httpMetadata: { contentType: replacementImage.type, cacheControl: "private, no-store" },
        customMetadata: { reportId, uploadedBy: session.user.id },
      })
    }
    await env.DB.prepare(`
      INSERT INTO resource_reports (id, resource_id, reporter_user_id, reason_code, target_field, target_index, details, suggested_url, suggested_image_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(reportId, resource.id, session.user.id, reasonCode, targetField, targetIndex, details, suggestedUrl || null, suggestedImageKey).run()
  } catch {
    if (suggestedImageKey) await env.RESOURCE_ASSETS.delete(suggestedImageKey).catch(() => {})
    return Response.json({ message: "Your report could not be saved. Try again." }, { status: 500 })
  }

  return Response.json({ report: { id: reportId, status: "open" } }, { status: 201, headers: { "Cache-Control": "private, no-store" } })
}
