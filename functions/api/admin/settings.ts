import { getAdminUser, readModerationSettings } from "../../_shared/admin"
import type { AuthEnv } from "../../_shared/auth"

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const user = await getAdminUser(request, env, waitUntil)
  if (!user) return Response.json({ message: "Admin access is required." }, { status: 403 })
  const settings = await readModerationSettings(env.DB)
  return Response.json({ settings }, { headers: { "Cache-Control": "private, no-store" } })
}

export const onRequestPut: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Settings request origin was not allowed." }, { status: 403 })
  }
  const user = await getAdminUser(request, env, waitUntil)
  if (!user) return Response.json({ message: "Admin access is required." }, { status: 403 })

  let body: unknown
  try { body = await request.json() } catch { return Response.json({ message: "Settings data could not be read." }, { status: 400 }) }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "Settings data is invalid." }, { status: 400 })
  }
  const input = body as Record<string, unknown>
  if (typeof input.autoApproval !== "boolean" || typeof input.submissionsLocked !== "boolean") {
    return Response.json({ message: "Choose valid values for both settings." }, { status: 400 })
  }

  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare("UPDATE site_settings SET value = ?, updated_at = ? WHERE key = 'auto_approval'").bind(String(input.autoApproval), now),
    env.DB.prepare("UPDATE site_settings SET value = ?, updated_at = ? WHERE key = 'submissions_locked'").bind(String(input.submissionsLocked), now),
  ])
  return Response.json({ settings: await readModerationSettings(env.DB) }, { headers: { "Cache-Control": "private, no-store" } })
}
