import { createAuth, type AuthEnv } from "./auth"

export async function getAdminUser(request: Request, env: AuthEnv, waitUntil: (promise: Promise<unknown>) => void) {
  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return null

  const admin = await env.DB.prepare("SELECT 1 AS allowed FROM site_admins WHERE user_id = ?")
    .bind(session.user.id)
    .first<{ allowed: number }>()
  return admin ? session.user : null
}

export async function readModerationSettings(db: D1Database) {
  const rows = await db.prepare("SELECT key, value FROM site_settings WHERE key IN ('auto_approval', 'submissions_locked')")
    .all<{ key: string; value: string }>()
  const values = new Map(rows.results.map(({ key, value }) => [key, value]))
  return {
    autoApproval: values.get("auto_approval") === "true",
    submissionsLocked: values.get("submissions_locked") === "true",
  }
}
