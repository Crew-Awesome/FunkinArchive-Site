import { getAdminUser } from "../../_shared/admin"
import type { AuthEnv } from "../../_shared/auth"

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const admin = await getAdminUser(request, env, waitUntil)
  if (!admin) return Response.json({ message: "Admin access is required." }, { status: 403 })
  const url = new URL(request.url)
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120)
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = 20
  const where = query ? "WHERE instr(lower(coalesce(username, '')), lower(?)) > 0 OR instr(lower(name), lower(?)) > 0 OR instr(lower(email), lower(?)) > 0 OR instr(lower(id), lower(?)) > 0" : ""
  const bindings = query ? [query, query, query, query] : []
  const [count, result] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM "user" ${where}`).bind(...bindings).first<{ total: number }>(),
    env.DB.prepare(`SELECT "user".id, "user".name, "user".username, "user".email, "user".image, "user".bio,
      "user".banner, "user".createdAt AS created_at,
      EXISTS (SELECT 1 FROM site_admins WHERE site_admins.user_id = "user".id) AS is_admin,
      (SELECT COUNT(*) FROM resources WHERE submitted_by_user_id = "user".id) AS resource_count,
      (SELECT COUNT(*) FROM resources WHERE submitted_by_user_id = "user".id AND (trim(status) = '' OR lower(trim(status)) IN ('accepted', 'approved'))) AS approved_count
      FROM "user" ${where} ORDER BY "user".createdAt DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>(),
  ])
  const ids = result.results.map((row) => String(row.id))
  const marks = ids.map(() => "?").join(",")
  const [restrictions, actions, resourceRows] = ids.length ? await Promise.all([
    env.DB.prepare(`SELECT id, user_id, action, reason, expires_at, created_at FROM user_restrictions
      WHERE user_id IN (${marks}) AND revoked_at IS NULL AND (expires_at IS NULL OR julianday(expires_at) > julianday('now'))
      ORDER BY created_at DESC`).bind(...ids).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT recent.id, recent.target_user_id, recent.action, recent.note, recent.created_at, admin.username AS admin_username
      FROM user_admin_actions recent LEFT JOIN "user" admin ON admin.id = recent.admin_user_id
      WHERE recent.target_user_id IN (${marks}) AND recent.id IN (
        SELECT chosen.id FROM user_admin_actions chosen WHERE chosen.target_user_id = recent.target_user_id
        ORDER BY chosen.created_at DESC LIMIT 3
      ) ORDER BY recent.created_at DESC`).bind(...ids).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, user_id, slug, title, status, created_at FROM (
      SELECT id, submitted_by_user_id AS user_id, slug, title, status, created_at,
        ROW_NUMBER() OVER (PARTITION BY submitted_by_user_id ORDER BY created_at DESC) AS position
      FROM resources WHERE submitted_by_user_id IN (${marks})
    ) WHERE position <= 5 ORDER BY created_at DESC`).bind(...ids).all<Record<string, unknown>>(),
  ]) : [{ results: [] }, { results: [] }, { results: [] }]
  const restrictionsByUser = new Map<string, Record<string, unknown>[]>()
  for (const row of restrictions.results) restrictionsByUser.set(String(row.user_id), [...(restrictionsByUser.get(String(row.user_id)) ?? []), row])
  const actionsByUser = new Map<string, Record<string, unknown>[]>()
  for (const row of actions.results) actionsByUser.set(String(row.target_user_id), [...(actionsByUser.get(String(row.target_user_id)) ?? []), row])
  const resourcesByUser = new Map<string, Record<string, unknown>[]>()
  for (const row of resourceRows.results) resourcesByUser.set(String(row.user_id), [...(resourcesByUser.get(String(row.user_id)) ?? []), row])
  const total = Number(count?.total ?? 0)
  return Response.json({ users: result.results.map((row) => ({
    id: row.id, name: row.name, username: row.username, email: row.email, image: row.image, bio: row.bio,
    banner: row.banner, createdAt: row.created_at, isAdmin: Boolean(row.is_admin),
    resourceCount: Number(row.resource_count ?? 0), approvedCount: Number(row.approved_count ?? 0),
    restrictions: restrictionsByUser.get(String(row.id)) ?? [], actions: actionsByUser.get(String(row.id)) ?? [],
    resources: resourcesByUser.get(String(row.id)) ?? [],
  })), total, page, pageSize, pageCount: Math.ceil(total / pageSize) }, { headers: { "Cache-Control": "private, no-store" } })
}
