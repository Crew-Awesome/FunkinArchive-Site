import { createAuth, type AuthEnv } from "../../_shared/auth"
import { ensureUsername, usernameChangeAvailableAt } from "../../_shared/usernames"
import { userRestrictionResponse } from "../../_shared/user-restrictions"

const usernamePattern = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/

export const onRequestPut: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Username update origin was not allowed." }, { status: 403 })
  }

  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ message: "Log in to change your username." }, { status: 401 })
  const restriction = await userRestrictionResponse(env.DB, session.user.id, "community")
  if (restriction) return restriction

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "Enter a valid username." }, { status: 400 })
  }
  if (!body || typeof body !== "object" || typeof (body as { username?: unknown }).username !== "string") {
    return Response.json({ message: "Enter a valid username." }, { status: 400 })
  }

  const username = ((body as { username: string }).username).trim().toLowerCase()
  if (!usernamePattern.test(username)) {
    return Response.json({ message: "Usernames must be 3–24 characters and use letters, numbers, or hyphens." }, { status: 400 })
  }

  const user = await env.DB.prepare(`SELECT id, name, username, username_changed_at FROM "user" WHERE id = ?`)
    .bind(session.user.id)
    .first<{ id: string; name: string; username: string | null; username_changed_at: string | null }>()
  if (!user) return Response.json({ message: "Your account could not be found." }, { status: 404 })

  const currentUsername = user.username ?? await ensureUsername(env.DB, user.id, user.name)
  if (username === currentUsername.toLowerCase()) {
    return Response.json({ username: currentUsername, usernameChangeAvailableAt: usernameChangeAvailableAt(user.username_changed_at) }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  const availableAt = usernameChangeAvailableAt(user.username_changed_at)
  if (availableAt && Date.now() < Date.parse(availableAt)) {
    return Response.json({ message: `You can change your username again on ${availableAt}.`, usernameChangeAvailableAt: availableAt }, { status: 429 })
  }

  const taken = await env.DB.prepare(`SELECT id FROM "user" WHERE username = ? COLLATE NOCASE AND id != ? LIMIT 1`)
    .bind(username, user.id)
    .first<{ id: string }>()
  if (taken) return Response.json({ message: "That username is already in use." }, { status: 409 })

  const updated = await env.DB.prepare(`
    UPDATE "user"
    SET username = ?, username_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND (username_changed_at IS NULL OR julianday(username_changed_at) <= julianday('now', '-7 days'))
  `).bind(username, user.id).run()

  if (!updated.meta.changes) {
    const latest = await env.DB.prepare(`SELECT username_changed_at FROM "user" WHERE id = ?`)
      .bind(user.id)
      .first<{ username_changed_at: string | null }>()
    const nextAvailableAt = usernameChangeAvailableAt(latest?.username_changed_at ?? null)
    return Response.json({ message: nextAvailableAt ? `You can change your username again on ${nextAvailableAt}.` : "Your username could not be changed." }, { status: nextAvailableAt ? 429 : 409 })
  }

  return Response.json({
    username,
    usernameChangeAvailableAt: usernameChangeAvailableAt(new Date().toISOString()),
  }, { headers: { "Cache-Control": "private, no-store" } })
}
