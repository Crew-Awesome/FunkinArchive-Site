import { createAuth, type AuthEnv } from "../../../_shared/auth"
import { accountImageKeyFromUrl } from "../../../_shared/account-assets"

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Update request origin was not allowed." }, { status: 403 })
  }

  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ message: "You must be signed in to update a resource." }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "Provide a resource and image URL." }, { status: 400 })
  }
  if (!body || typeof body !== "object") return Response.json({ message: "Provide a resource and image URL." }, { status: 400 })

  const { resourceId, imageUrl } = body as { resourceId?: unknown; imageUrl?: unknown }
  const imageKey = typeof imageUrl === "string" ? accountImageKeyFromUrl(imageUrl, session.user.id) : null
  if (typeof resourceId !== "string" || !resourceId || !imageKey) {
    return Response.json({ message: "Provide a valid resource and image." }, { status: 400 })
  }

  const result = await env.DB.prepare(`
    UPDATE resources
    SET cover_url = NULL, cover_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND submitted_by_user_id = ?
  `).bind(imageKey, resourceId, session.user.id).run()

  if (result.meta.changes === 0) return Response.json({ message: "That resource was not found in your submissions." }, { status: 404 })
  return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } })
}
