import type { PublicProfile, PublicProfilePreview } from "@/data/resources"

export async function fetchPublicProfile(userId: string, signal?: AbortSignal): Promise<PublicProfile> {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
    signal,
    headers: { Accept: "application/json" },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  const result = await response.json() as { profile: PublicProfile }
  return result.profile
}

export async function fetchPublicProfilePreview(userId: string): Promise<PublicProfilePreview> {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}?preview=1`, {
    headers: { Accept: "application/json" },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  const result = await response.json() as { profile: PublicProfilePreview }
  return result.profile
}
