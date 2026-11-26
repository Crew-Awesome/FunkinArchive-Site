import { createAuth, type AuthEnv } from "../../_shared/auth"

export const onRequest: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const path = new URL(request.url).pathname
  const isSocialSignIn = request.method === "POST" && path.endsWith("/sign-in/social")
  if (isSocialSignIn && (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)) {
    const body = await request.clone().json().catch(() => null) as { provider?: string } | null
    if (body?.provider === "github") {
      return Response.json({ message: "GitHub sign-in has not been configured yet." }, { status: 503 })
    }
  }
  const auth = createAuth(env, request, waitUntil)
  return auth.handler(request)
}
