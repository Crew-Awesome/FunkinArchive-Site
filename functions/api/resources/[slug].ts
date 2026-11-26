import { publicResourceStatusCondition, toResource, type ResourceRow } from "../../_shared/resources"

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const slug = params.slug
  if (typeof slug !== "string" || !slug) return Response.json({ error: "Resource not found." }, { status: 404 })

  const row = await env.DB.prepare(`
    SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image
    FROM resources
    LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
    WHERE ${publicResourceStatusCondition} AND resources.slug = ?
    LIMIT 1
  `).bind(slug).first<ResourceRow>()
  if (!row) return Response.json({ error: "Resource not found." }, { status: 404 })

  return Response.json({ resource: toResource(row) }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } })
}
