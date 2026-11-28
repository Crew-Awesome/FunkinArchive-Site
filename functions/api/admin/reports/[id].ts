import { getAdminUser } from "../../../_shared/admin"
import type { AuthEnv } from "../../../_shared/auth"

type ReportRow = {
  id: string; resource_id: string; target_field: string; target_index: number | null
  suggested_url: string | null; suggested_image_key: string | null; status: string
  cover_key: string | null; cover_url: string | null; download_key: string | null; download_url: string | null
  alternate_downloads: string; description: string; original_by: string | null; from_mod: string | null
}

export const onRequestPatch: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return Response.json({ message: "Request origin was not allowed." }, { status: 403 })
  const admin = await getAdminUser(request, env, waitUntil)
  if (!admin) return Response.json({ message: "Admin access is required." }, { status: 403 })
  if (typeof params.id !== "string" || !params.id) return Response.json({ message: "Report not found." }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return Response.json({ message: "Report action could not be read." }, { status: 400 }) }
  const action = body.action
  const allowed = new Set(["investigate", "dismiss", "resolve", "apply_fix", "reject_resource"])
  if (typeof action !== "string" || !allowed.has(action)) return Response.json({ message: "Choose a valid report action." }, { status: 400 })
  const report = await env.DB.prepare(`SELECT rr.*, r.cover_key, r.cover_url, r.download_key, r.download_url,
    r.alternate_downloads, r.description, r.original_by, r.from_mod
    FROM resource_reports rr JOIN resources r ON r.id = rr.resource_id WHERE rr.id = ?`).bind(params.id).first<ReportRow>()
  if (!report) return Response.json({ message: "Report not found." }, { status: 404 })
  const now = new Date().toISOString()
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : ""
  let nextStatus = report.status
  let targetField: string | null = null
  let beforeValue: string | null = null
  let afterValue: string | null = null
  const statements: D1PreparedStatement[] = []

  if (action === "investigate") nextStatus = "in_review"
  if (action === "dismiss" || action === "resolve" || action === "apply_fix" || action === "reject_resource") nextStatus = action === "dismiss" ? "dismissed" : "resolved"
  if (action === "reject_resource") {
    nextStatus = "resolved"
    statements.push(env.DB.prepare("UPDATE resources SET status = 'rejected', updated_at = ? WHERE id = ?").bind(now, report.resource_id))
  }
  if (action === "apply_fix") {
    targetField = report.target_field
    const submittedValue = typeof body.value === "string" ? body.value.trim() : ""
    if (targetField === "cover") {
      if (report.suggested_image_key && !submittedValue) {
        beforeValue = report.cover_key ?? report.cover_url
        afterValue = report.suggested_image_key
        statements.push(env.DB.prepare("UPDATE resources SET cover_key = ?, cover_url = NULL, updated_at = ? WHERE id = ?").bind(afterValue, now, report.resource_id))
      } else {
        const value = submittedValue || report.suggested_url || ""
        if (!/^https?:\/\//i.test(value) || value.length > 2048) return Response.json({ message: "Add a valid replacement image URL." }, { status: 400 })
        beforeValue = report.cover_key ?? report.cover_url; afterValue = value
        statements.push(env.DB.prepare("UPDATE resources SET cover_key = NULL, cover_url = ?, updated_at = ? WHERE id = ?").bind(value, now, report.resource_id))
      }
    } else if (targetField === "download" || targetField === "alternate_download") {
      const value = submittedValue || report.suggested_url || ""
      if (!/^https?:\/\//i.test(value) || value.length > 2048) return Response.json({ message: "Add a valid replacement download URL." }, { status: 400 })
      beforeValue = targetField === "download" ? report.download_key ?? report.download_url : report.alternate_downloads
      afterValue = value
      if (targetField === "download") statements.push(env.DB.prepare("UPDATE resources SET download_key = NULL, download_url = ?, updated_at = ? WHERE id = ?").bind(value, now, report.resource_id))
      else {
        let alternatives: unknown
        try { alternatives = JSON.parse(report.alternate_downloads) } catch { return Response.json({ message: "Alternate downloads could not be updated safely." }, { status: 409 }) }
        if (!Array.isArray(alternatives) || report.target_index == null || report.target_index < 0 || report.target_index >= alternatives.length) return Response.json({ message: "The reported alternate download no longer exists." }, { status: 409 })
        alternatives[report.target_index] = value
        afterValue = JSON.stringify(alternatives)
        statements.push(env.DB.prepare("UPDATE resources SET alternate_downloads = ?, updated_at = ? WHERE id = ?").bind(afterValue, now, report.resource_id))
      }
    } else return Response.json({ message: "This report does not have an applicable replacement." }, { status: 400 })
  }

  statements.push(env.DB.prepare(`UPDATE resource_reports SET status = ?, resolution_note = ?, resolved_by_user_id = ?,
    updated_at = ?, resolved_at = CASE WHEN ? IN ('resolved', 'dismissed') THEN ? ELSE resolved_at END WHERE id = ?`)
    .bind(nextStatus, note, admin.id, now, nextStatus, now, report.id))
  statements.push(env.DB.prepare(`INSERT INTO resource_report_actions (id, report_id, admin_user_id, action, target_field, before_value, after_value, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), report.id, admin.id, action, targetField, beforeValue, afterValue, note))
  await env.DB.batch(statements)
  if (report.suggested_image_key && (action === "dismiss" || action === "resolve" || action === "reject_resource" || (action === "apply_fix" && afterValue !== report.suggested_image_key))) {
    await env.RESOURCE_ASSETS.delete(report.suggested_image_key).catch(() => {})
  }
  return Response.json({ status: nextStatus }, { headers: { "Cache-Control": "private, no-store" } })
}
