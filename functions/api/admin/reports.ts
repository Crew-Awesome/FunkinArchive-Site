import { getAdminUser } from "../../_shared/admin"
import type { AuthEnv } from "../../_shared/auth"

const statuses = new Set(["open", "in_review", "resolved", "dismissed"])

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const admin = await getAdminUser(request, env, waitUntil)
  if (!admin) return Response.json({ message: "Admin access is required." }, { status: 403 })
  const url = new URL(request.url)
  const status = url.searchParams.get("status") ?? "open"
  if (!statuses.has(status)) return Response.json({ message: "Choose a valid report status." }, { status: 400 })
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = 20
  const [rows, counts] = await Promise.all([
    env.DB.prepare(`SELECT rr.*, r.slug AS resource_slug, r.title AS resource_title, r.cover_key, r.cover_url,
      r.download_key, r.download_url, r.alternate_downloads, r.description, r.original_by, r.from_mod,
      reporter.username AS reporter_username, reporter.name AS reporter_name
      FROM resource_reports rr JOIN resources r ON r.id = rr.resource_id
      LEFT JOIN "user" reporter ON reporter.id = rr.reporter_user_id
      WHERE rr.status = ? ORDER BY CASE rr.status WHEN 'open' THEN 0 ELSE 1 END, rr.created_at ASC
      LIMIT ? OFFSET ?`).bind(status, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT SUM(status = 'open') AS open, SUM(status = 'in_review') AS in_review,
      SUM(status = 'resolved') AS resolved, SUM(status = 'dismissed') AS dismissed FROM resource_reports`).first<Record<string, number | null>>(),
  ])
  const total = Number(counts?.[status] ?? 0)
  const reports = rows.results.map((row) => {
    const targetField = String(row.target_field)
    let currentValue: string | null = null
    if (targetField === "cover") currentValue = row.cover_key ? `/api/assets?key=${encodeURIComponent(String(row.cover_key))}` : String(row.cover_url ?? "") || null
    if (targetField === "download") currentValue = row.download_key ? `/api/assets?key=${encodeURIComponent(String(row.download_key))}&download=1` : String(row.download_url ?? "") || null
    if (targetField === "alternate_download") {
      try { currentValue = (JSON.parse(String(row.alternate_downloads ?? "[]")) as unknown[])[Number(row.target_index)] as string ?? null } catch { currentValue = null }
    }
    if (targetField === "metadata") currentValue = JSON.stringify({ description: row.description, originalBy: row.original_by, fromMod: row.from_mod })
    return {
      id: row.id, resourceId: row.resource_id, resourceSlug: row.resource_slug, resourceTitle: row.resource_title,
      reporter: row.reporter_username ? `@${row.reporter_username}` : row.reporter_name ?? "Account",
      reasonCode: row.reason_code, targetField, targetIndex: row.target_index == null ? null : Number(row.target_index),
      details: row.details, suggestedUrl: row.suggested_url,
      suggestedImageUrl: row.suggested_image_key ? `/api/admin/reports/${encodeURIComponent(String(row.id))}/image` : null,
      currentValue, createdAt: row.created_at,
    }
  })
  return Response.json({ reports, total, page, pageSize, pageCount: Math.ceil(total / pageSize), counts: {
    open: Number(counts?.open ?? 0), in_review: Number(counts?.in_review ?? 0), resolved: Number(counts?.resolved ?? 0), dismissed: Number(counts?.dismissed ?? 0),
  } }, { headers: { "Cache-Control": "private, no-store" } })
}
