import { publicResourceStatusCondition } from "../../_shared/resources"
import { createAuth, type AuthEnv } from "../../_shared/auth"

interface RatingRow {
  id: string
  submitted_by_user_id: string | null
}

async function getSession(request: Request, env: AuthEnv, waitUntil: (promise: Promise<unknown>) => void) {
  const auth = createAuth(env, request, waitUntil)
  return auth.api.getSession({ headers: request.headers })
}

async function loadRating(env: Env, resourceId: string, userId: string | null) {
  const [aggregate, own] = await Promise.all([
    env.DB.prepare("SELECT AVG(rating) AS average, COUNT(*) AS count FROM resource_ratings WHERE resource_id = ?")
      .bind(resourceId)
      .first<{ average: number | null; count: number }>(),
    userId
      ? env.DB.prepare("SELECT rating FROM resource_ratings WHERE resource_id = ? AND user_id = ?")
        .bind(resourceId, userId)
        .first<{ rating: number }>()
      : Promise.resolve(null),
  ])
  return {
    average: aggregate?.average == null ? null : Number(aggregate.average),
    count: Number(aggregate?.count ?? 0),
    userRating: own ? Number(own.rating) : null,
  }
}

async function getResource(env: Env, slug: string) {
  return env.DB.prepare(`
    SELECT id, submitted_by_user_id
    FROM resources
    WHERE ${publicResourceStatusCondition} AND slug = ?
    LIMIT 1
  `).bind(slug).first<RatingRow>()
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  const slug = params.slug
  if (typeof slug !== "string" || !slug) return Response.json({ error: "Resource not found." }, { status: 404 })
  const resource = await getResource(env, slug)
  if (!resource) return Response.json({ error: "Resource not found." }, { status: 404 })
  const session = await getSession(request, env, waitUntil)
  return Response.json({ rating: await loadRating(env, resource.id, session?.user.id ?? null) }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}

export const onRequestPut: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Rating request origin was not allowed." }, { status: 403 })
  }
  const slug = params.slug
  if (typeof slug !== "string" || !slug) return Response.json({ error: "Resource not found." }, { status: 404 })
  const session = await getSession(request, env, waitUntil)
  if (!session) return Response.json({ error: "Log in to rate a resource." }, { status: 401 })
  const resource = await getResource(env, slug)
  if (!resource) return Response.json({ error: "Resource not found." }, { status: 404 })
  if (resource.submitted_by_user_id === session.user.id) {
    return Response.json({ error: "You can’t rate your own resource." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Provide a rating from 0.5 to 5." }, { status: 400 })
  }
  const rating = body && typeof body === "object" && "rating" in body ? Number((body as { rating: unknown }).rating) : Number.NaN
  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || rating * 2 !== Math.round(rating * 2)) {
    return Response.json({ error: "Choose a rating in half-star steps from 0.5 to 5." }, { status: 400 })
  }

  await env.DB.prepare(`
    INSERT INTO resource_ratings (resource_id, user_id, rating)
    VALUES (?, ?, ?)
    ON CONFLICT (resource_id, user_id) DO UPDATE
    SET rating = excluded.rating, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(resource.id, session.user.id, rating).run()
  return Response.json({ rating: await loadRating(env, resource.id, session.user.id) }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}

export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env, params, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Rating request origin was not allowed." }, { status: 403 })
  }
  const slug = params.slug
  if (typeof slug !== "string" || !slug) return Response.json({ error: "Resource not found." }, { status: 404 })
  const session = await getSession(request, env, waitUntil)
  if (!session) return Response.json({ error: "Log in to change your rating." }, { status: 401 })
  const resource = await getResource(env, slug)
  if (!resource) return Response.json({ error: "Resource not found." }, { status: 404 })
  await env.DB.prepare("DELETE FROM resource_ratings WHERE resource_id = ? AND user_id = ?")
    .bind(resource.id, session.user.id)
    .run()
  return Response.json({ rating: await loadRating(env, resource.id, session.user.id) }, {
    headers: { "Cache-Control": "private, no-store" },
  })
}
