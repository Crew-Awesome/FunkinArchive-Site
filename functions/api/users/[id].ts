import { publicResourceStatusCondition, toResource, type ResourceRow } from "../../_shared/resources"
import { ensureUsername } from "../../_shared/usernames"

interface PublicUserRow {
  id: string
  username: string | null
  name: string
  image: string | null
  bio: string
  banner: string | null
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const usernameOrId = params.id
  if (typeof usernameOrId !== "string" || !usernameOrId) return Response.json({ error: "Profile not found." }, { status: 404 })

  const user = await env.DB.prepare(`SELECT id, username, name, image, bio, banner FROM "user" WHERE username = ? COLLATE NOCASE OR id = ? LIMIT 1`)
    .bind(usernameOrId, usernameOrId)
    .first<PublicUserRow>()
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 })
  user.username = user.username ?? await ensureUsername(env.DB, user.id, user.name)

  const preview = new URL(request.url).searchParams.get("preview") === "1"
  if (preview) {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM resources WHERE ${publicResourceStatusCondition} AND submitted_by_user_id = ?`)
      .bind(user.id)
      .first<{ total: number }>()
    return Response.json({ profile: { ...user, total: Number(count?.total ?? 0) } }, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    })
  }

  const [rows, count] = await Promise.all([
    env.DB.prepare(`
      SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image, submitter.username AS account_submitter_username
      FROM resources
      LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
      WHERE ${publicResourceStatusCondition} AND resources.submitted_by_user_id = ?
      ORDER BY resources.created_at DESC
      LIMIT 100
    `).bind(user.id).all<ResourceRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM resources WHERE ${publicResourceStatusCondition} AND submitted_by_user_id = ?`)
      .bind(user.id)
      .first<{ total: number }>(),
  ])

  return Response.json({
    profile: { ...user, resources: rows.results.map(toResource), total: Number(count?.total ?? 0) },
  }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } })
}
