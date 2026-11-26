import { getAdminUser } from "../../../../_shared/admin"
import type { AuthEnv } from "../../../../_shared/auth"

const allowedStatuses = new Set(["pending", "accepted", "rejected"])

export const onRequestPatch: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Approval request origin was not allowed." }, { status: 403 })
  }
  const user = await getAdminUser(request, env, waitUntil)
  if (!user) return Response.json({ message: "Admin access is required." }, { status: 403 })

  const id = params.id
  if (typeof id !== "string" || !id) return Response.json({ message: "Resource not found." }, { status: 404 })
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ message: "Approval data could not be read." }, { status: 400 }) }
  const status = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).status : null
  if (typeof status !== "string" || !allowedStatuses.has(status)) {
    return Response.json({ message: "Choose pending, accepted, or rejected." }, { status: 400 })
  }

  const result = await env.DB.prepare("UPDATE resources SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id)
    .run()
  if (!result.meta.changes) return Response.json({ message: "Resource not found." }, { status: 404 })
  return Response.json({ status }, { headers: { "Cache-Control": "private, no-store" } })
}
