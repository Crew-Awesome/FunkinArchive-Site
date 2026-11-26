import { createAuth, type AuthEnv } from "../../_shared/auth"
import { accountImageKeyFromUrl } from "../../_shared/account-assets"
import { ensureUsername, usernameChangeAvailableAt } from "../../_shared/usernames"

interface ProfileInput {
  name?: unknown
  image?: unknown
  bio?: unknown
  banner?: unknown
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ message: "You must be signed in to view your profile." }, { status: 401 })

  const profile = await env.DB.prepare(`SELECT id, name, username, username_changed_at, bio, banner FROM "user" WHERE id = ?`)
    .bind(session.user.id)
    .first<{ id: string; name: string; username: string | null; username_changed_at: string | null; bio: string; banner: string | null }>()

  const username = await ensureUsername(env.DB, session.user.id, profile?.name ?? session.user.name ?? "Member")

  return Response.json({
    bio: profile?.bio ?? "",
    banner: profile?.banner ?? null,
    username,
    usernameChangeAvailableAt: usernameChangeAvailableAt(profile?.username_changed_at ?? null),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}

export const onRequestPut: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Profile update origin was not allowed." }, { status: 403 })
  }

  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ message: "You must be signed in to update your profile." }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "Provide your profile details." }, { status: 400 })
  }
  if (!body || typeof body !== "object") return Response.json({ message: "Provide your profile details." }, { status: 400 })
  const input = body as ProfileInput

  const name = typeof input.name === "string" ? input.name.trim() : ""
  const bio = typeof input.bio === "string" ? input.bio.trim() : null
  const image = input.image === null || typeof input.image === "string" ? input.image : undefined
  const banner = input.banner === null || typeof input.banner === "string" ? input.banner : undefined

  if (!name || name.length > 80 || bio === null || bio.length > 160) {
    return Response.json({ message: "Names must be 1 to 80 characters and bios up to 160 characters." }, { status: 400 })
  }
  const currentProfile = await env.DB.prepare(`SELECT image, banner FROM "user" WHERE id = ?`)
    .bind(session.user.id)
    .first<{ image: string | null; banner: string | null }>()

  if (image === undefined || (image !== null && image !== currentProfile?.image && !accountImageKeyFromUrl(image, session.user.id))) {
    return Response.json({ message: "Choose a valid profile picture." }, { status: 400 })
  }
  if (banner === undefined || (banner !== null && banner !== currentProfile?.banner && !accountImageKeyFromUrl(banner, session.user.id))) {
    return Response.json({ message: "Choose a valid profile banner." }, { status: 400 })
  }

  await env.DB.prepare(`UPDATE "user" SET name = ?, image = ?, bio = ?, banner = ? WHERE id = ?`)
    .bind(name, image, bio, banner, session.user.id)
    .run()

  return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } })
}
