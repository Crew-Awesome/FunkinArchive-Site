import { publicResourceStatusCondition, toResource, type ResourceRow } from "../../_shared/resources"

interface PublicUserRow {
  id: string
  name: string
  image: string | null
  bio: string
  banner: string | null
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = params.id
  if (typeof id !== "string" || !id) return Response.json({ error: "Profile not found." }, { status: 404 })

  const user = await env.DB.prepare(`SELECT id, name, image, bio, banner FROM "user" WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<PublicUserRow>()
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 })

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
      SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image
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
