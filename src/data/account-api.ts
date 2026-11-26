import type { ResourceListing, ResourceSubmissionInput } from "@/data/resources"

export interface AccountResourcesResult {
  resources: ResourceListing[]
  total: number
}

export interface AccountProfileUpdate {
  name: string
  image: string | null
  bio: string
  banner: string | null
}

async function getErrorMessage(response: Response) {
  const result = await response.json().catch(() => null) as { message?: string } | null
  return result?.message ?? `Request failed (${response.status})`
}

export async function fetchAccountResources(signal?: AbortSignal): Promise<AccountResourcesResult> {
  const response = await fetch("/api/account/resources", { signal, credentials: "same-origin" })
  if (!response.ok) throw new Error(await getErrorMessage(response))
  const result = await response.json() as AccountResourcesResult
  return { resources: result.resources, total: Number(result.total ?? result.resources.length) }
}

export async function fetchAccountProfile(signal?: AbortSignal): Promise<{ bio: string; banner: string | null; username: string; usernameChangeAvailableAt: string | null }> {
  const response = await fetch("/api/account/profile", { signal, credentials: "same-origin" })
  if (!response.ok) throw new Error(await getErrorMessage(response))
  return await response.json() as { bio: string; banner: string | null; username: string; usernameChangeAvailableAt: string | null }
}

export async function saveAccountUsername(username: string): Promise<{ username: string; usernameChangeAvailableAt: string | null }> {
  const response = await fetch("/api/account/username", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response))
  return await response.json() as { username: string; usernameChangeAvailableAt: string | null }
}

export async function saveAccountProfile(profile: AccountProfileUpdate): Promise<void> {
  const response = await fetch("/api/account/profile", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response))
}

export async function uploadAccountImage(file: File): Promise<string> {
  const body = new FormData()
  body.set("image", file)
  const response = await fetch("/api/account/uploads", { method: "POST", body, credentials: "same-origin" })
  if (!response.ok) throw new Error(await getErrorMessage(response))
  const result = await response.json() as { url: string }
  return result.url
}

export async function submitResource(input: ResourceSubmissionInput): Promise<ResourceListing> {
  const response = await fetch("/api/account/resources", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response))
  const result = await response.json() as { resource: ResourceListing }
  return result.resource
}

export async function fetchAccountResource(slug: string, signal?: AbortSignal): Promise<ResourceListing> {
  const response = await fetch(`/api/account/resources/${encodeURIComponent(slug)}`, { signal, credentials: "same-origin" })
  if (!response.ok) throw new Error(await getErrorMessage(response))
  const result = await response.json() as { resource: ResourceListing }
  return result.resource
}

export async function updateAccountResource(slug: string, input: ResourceSubmissionInput, coverUrl?: string | null): Promise<ResourceListing> {
  const response = await fetch(`/api/account/resources/${encodeURIComponent(slug)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, coverUrl }),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response))
  const result = await response.json() as { resource: ResourceListing }
  return result.resource
}

