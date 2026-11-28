import { getAdminUser } from "../../../../_shared/admin"
import type { AuthEnv } from "../../../../_shared/auth"

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  const admin = await getAdminUser(request, env, waitUntil)
  if (!admin) return Response.json({ message: "Admin access is required." }, { status: 403 })
  if (typeof params.id !== "string") return Response.json({ message: "Image not found." }, { status: 404 })
  const row = await env.DB.prepare("SELECT suggested_image_key FROM resource_reports WHERE id = ?").bind(params.id).first<{ suggested_image_key: string | null }>()
  if (!row?.suggested_image_key) return Response.json({ message: "Image not found." }, { status: 404 })
  const object = await env.RESOURCE_ASSETS.get(row.suggested_image_key)
  if (!object) return Response.json({ message: "Image not found." }, { status: 404 })
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("Cache-Control", "private, no-store")
  headers.set("X-Content-Type-Options", "nosniff")
  return new Response(object.body, { headers })
}
