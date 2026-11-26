function usernameFromName(name: string) {
  return name.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24).replace(/-+$/g, "")
}

export async function ensureUsername(db: D1Database, userId: string, name: string) {
  const current = await db.prepare(`SELECT username FROM "user" WHERE id = ?`).bind(userId).first<{ username: string | null }>()
  if (current?.username) return current.username

  const base = usernameFromName(name) || "member"
  const suffix = userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-6) || "member"
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ending = attempt === 0 ? "" : `-${suffix}${attempt > 1 ? attempt : ""}`
    const candidate = `${base.slice(0, 24 - ending.length).replace(/-+$/g, "")}${ending}`
    const owner = await db.prepare(`SELECT id FROM "user" WHERE username = ? COLLATE NOCASE LIMIT 1`)
      .bind(candidate)
      .first<{ id: string }>()
    if (owner && owner.id !== userId) continue

    await db.prepare(`UPDATE "user" SET username = ? WHERE id = ? AND username IS NULL`)
      .bind(candidate, userId)
      .run()
    const saved = await db.prepare(`SELECT username FROM "user" WHERE id = ?`).bind(userId).first<{ username: string | null }>()
    if (saved?.username) return saved.username
  }

  throw new Error("A unique username could not be assigned.")
}

export function usernameChangeAvailableAt(changedAt: string | null) {
  if (!changedAt) return null
  const timestamp = Date.parse(changedAt)
  return Number.isNaN(timestamp) ? null : new Date(timestamp + 7 * 24 * 60 * 60 * 1000).toISOString()
}
