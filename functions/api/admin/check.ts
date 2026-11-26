import { getAdminUser } from "../../_shared/admin"
import type { AuthEnv } from "../../_shared/auth"

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const user = await getAdminUser(request, env, waitUntil)
  return Response.json({ isAdmin: Boolean(user) }, { headers: { "Cache-Control": "private, no-store" } })
}
