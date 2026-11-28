type RestrictionAction = "ban" | "mute" | "restrict_submissions"
type UserActivity = "account" | "community" | "submit"

const messages: Record<RestrictionAction, string> = {
  ban: "This account is banned and cannot use account features.",
  mute: "This account is muted and cannot post or change community content.",
  restrict_submissions: "This account is not allowed to submit resources right now.",
}

export async function userRestrictionResponse(db: D1Database, userId: string, activity: UserActivity): Promise<Response | null> {
  const result = await db.prepare(`
    SELECT action FROM user_restrictions
    WHERE user_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR julianday(expires_at) > julianday('now'))
    ORDER BY CASE action WHEN 'ban' THEN 0 WHEN 'mute' THEN 1 ELSE 2 END
    LIMIT 1
  `).bind(userId).first<{ action: RestrictionAction }>()
  const action = result?.action
  if (!action) return null
  const applies = action === "ban" || (action === "mute" && activity !== "account") || (action === "restrict_submissions" && activity === "submit")
  return applies ? Response.json({ message: messages[action], restriction: action }, { status: 403, headers: { "Cache-Control": "private, no-store" } }) : null
}
