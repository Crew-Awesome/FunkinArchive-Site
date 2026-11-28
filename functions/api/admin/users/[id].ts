import { getAdminUser } from "../../../_shared/admin"
import type { AuthEnv } from "../../../_shared/auth"

const sanctions = new Set(["ban", "mute", "restrict_submissions"])
const durations = new Set(["permanent", "1", "7", "30"])

export const onRequestPatch: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return Response.json({ message: "Request origin was not allowed." }, { status: 403 })
  const admin = await getAdminUser(request, env, waitUntil)
  if (!admin) return Response.json({ message: "Admin access is required." }, { status: 403 })
  if (typeof params.id !== "string" || !params.id) return Response.json({ message: "User not found." }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return Response.json({ message: "User action could not be read." }, { status: 400 }) }
  const action = body.action
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : ""
  const target = await env.DB.prepare(`SELECT id, name, image, bio, banner,
    EXISTS (SELECT 1 FROM site_admins WHERE site_admins.user_id = "user".id) AS is_admin
    FROM "user" WHERE id = ?`).bind(params.id).first<{ id: string; name: string; image: string | null; bio: string; banner: string | null; is_admin: number }>()
  if (!target) return Response.json({ message: "User not found." }, { status: 404 })
  if (target.id === admin.id || target.is_admin) return Response.json({ message: "Admin accounts cannot be moderated here." }, { status: 409 })

  const now = new Date().toISOString()
  if (typeof action === "string" && sanctions.has(action)) {
    const duration = typeof body.duration === "string" ? body.duration : "7"
    if (!durations.has(duration)) return Response.json({ message: "Choose a valid restriction length." }, { status: 400 })
    if (note.length < 5) return Response.json({ message: "Add a short reason for this restriction." }, { status: 400 })
    const expiresAt = duration === "permanent" ? null : new Date(Date.now() + Number(duration) * 86_400_000).toISOString()
    const restrictionId = crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare(`UPDATE user_restrictions SET revoked_at = ?, revoked_by_user_id = ?, revoke_note = ?
        WHERE user_id = ? AND action = ? AND revoked_at IS NULL`).bind(now, admin.id, "Replaced by a newer restriction", target.id, action),
      env.DB.prepare(`INSERT INTO user_restrictions (id, user_id, action, reason, expires_at, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(restrictionId, target.id, action, note, expiresAt, admin.id),
      env.DB.prepare(`INSERT INTO user_admin_actions (id, target_user_id, admin_user_id, action, before_value, after_value, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), target.id, admin.id, action, null, JSON.stringify({ restrictionId, expiresAt }), note),
    ])
    return Response.json({ action, expiresAt }, { headers: { "Cache-Control": "private, no-store" } })
  }

  if (action === "lift") {
    const sanction = typeof body.sanction === "string" ? body.sanction : ""
    if (!sanctions.has(sanction)) return Response.json({ message: "Choose which restriction to lift." }, { status: 400 })
    const update = await env.DB.prepare(`UPDATE user_restrictions SET revoked_at = ?, revoked_by_user_id = ?, revoke_note = ?
      WHERE user_id = ? AND action = ? AND revoked_at IS NULL AND (expires_at IS NULL OR julianday(expires_at) > julianday('now'))`)
      .bind(now, admin.id, note || "Restriction lifted by an admin", target.id, sanction).run()
    if (!update.meta.changes) return Response.json({ message: "There is no active restriction of that type to lift." }, { status: 409 })
    await env.DB.prepare(`INSERT INTO user_admin_actions (id, target_user_id, admin_user_id, action, before_value, after_value, note)
      VALUES (?, ?, ?, 'lift_restriction', ?, ?, ?)`).bind(crypto.randomUUID(), target.id, admin.id, sanction, "lifted", note).run()
    return Response.json({ action: "lift", sanction }, { headers: { "Cache-Control": "private, no-store" } })
  }

  if (action === "reset_profile") {
    const before = JSON.stringify({ image: target.image, banner: target.banner, bio: target.bio })
    const after = JSON.stringify({ image: null, banner: null, bio: "" })
    await env.DB.batch([
      env.DB.prepare(`UPDATE "user" SET image = NULL, banner = NULL, bio = '' WHERE id = ?`).bind(target.id),
      env.DB.prepare(`INSERT INTO user_admin_actions (id, target_user_id, admin_user_id, action, before_value, after_value, note)
        VALUES (?, ?, ?, 'reset_profile', ?, ?, ?)`).bind(crypto.randomUUID(), target.id, admin.id, before, after, note),
    ])
    return Response.json({ action }, { headers: { "Cache-Control": "private, no-store" } })
  }
  return Response.json({ message: "Choose a valid user action." }, { status: 400 })
}
