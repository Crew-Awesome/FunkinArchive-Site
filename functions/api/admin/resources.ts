import { getAdminUser } from "../../_shared/admin"
import type { AuthEnv } from "../../_shared/auth"
import { toResource, type ResourceRow } from "../../_shared/resources"

const statusConditions: Record<string, string> = {
  pending: "lower(trim(status)) = 'pending'",
  accepted: "trim(status) = '' OR lower(trim(status)) IN ('accepted', 'approved')",
  rejected: "lower(trim(status)) = 'rejected'",
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const user = await getAdminUser(request, env, waitUntil)
  if (!user) return Response.json({ message: "Admin access is required." }, { status: 403 })

  const url = new URL(request.url)
  const status = url.searchParams.get("status") ?? "pending"
  const condition = statusConditions[status]
  if (!condition) return Response.json({ message: "Choose a valid approval status." }, { status: 400 })
  const page = Math.max(1, Math.min(1_000_000, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1))
  const pageSize = 20
  const [count, counts, result] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM resources WHERE ${condition}`).first<{ total: number }>(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN lower(trim(status)) = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN trim(status) = '' OR lower(trim(status)) IN ('accepted', 'approved') THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN lower(trim(status)) = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM resources`).first<{ pending: number | null; accepted: number | null; rejected: number | null }>(),
    env.DB.prepare(`SELECT resources.*, submitter.name AS account_submitter_name, submitter.image AS account_submitter_image, submitter.username AS account_submitter_username
      FROM resources
      LEFT JOIN "user" AS submitter ON resources.submitted_by_user_id = submitter.id
      WHERE ${condition}
      ORDER BY CASE WHEN lower(trim(status)) = 'pending' THEN 0 ELSE 1 END, resources.created_at DESC
      LIMIT ? OFFSET ?`).bind(pageSize, (page - 1) * pageSize).all<ResourceRow>(),
  ])

  const total = Number(count?.total ?? 0)
  const pageCount = Math.ceil(total / pageSize)
  return Response.json({
    resources: result.results.map(toResource),
    total,
    page: pageCount ? Math.min(page, pageCount) : 1,
    pageSize,
    pageCount,
    counts: { pending: Number(counts?.pending ?? 0), accepted: Number(counts?.accepted ?? 0), rejected: Number(counts?.rejected ?? 0) },
  }, { headers: { "Cache-Control": "private, no-store" } })
}
