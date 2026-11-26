const assetOrigin = "https://funkin-archive.invalid"

export function accountImageKey(userId: string): string {
  return `account-images/${encodeURIComponent(userId)}/${crypto.randomUUID()}`
}

export function accountImageUrl(key: string): string {
  return `/api/assets?key=${encodeURIComponent(key)}`
}

export function accountImageKeyFromUrl(value: string, userId: string): string | null {
  try {
    if (!value.startsWith("/api/assets?")) return null
    const url = new URL(value, assetOrigin)
    if (url.origin !== assetOrigin || url.pathname !== "/api/assets" || url.searchParams.getAll("key").length !== 1 || url.searchParams.size !== 1) return null

    const key = url.searchParams.get("key")
    const prefix = `account-images/${encodeURIComponent(userId)}/`
    if (!key?.startsWith(prefix)) return null

    const filename = key.slice(prefix.length)
    return /^[\da-f-]{36}\.(?:jpg|png|webp)$/.test(filename) ? key : null
  } catch {
    return null
  }
}
