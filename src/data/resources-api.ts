import type { ResourceListing, ResourceRating, ResourcesResponse } from "@/data/resources"
import { buildResourcesApiUrl } from "@/data/resources-query"

interface ApiError {
  error?: string
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) {
    const body = await response.json().catch((): ApiError => ({})) as ApiError
    throw new Error(body.error || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export function fetchResources(params: URLSearchParams, signal?: AbortSignal) {
  return getJson<ResourcesResponse>(buildResourcesApiUrl(params), signal)
}

export async function fetchResource(slug: string, signal?: AbortSignal): Promise<ResourceListing> {
  const response = await getJson<{ resource: ResourceListing }>(`/api/resources/${encodeURIComponent(slug)}`, signal)
  return response.resource
}

async function getRatingResponse(slug: string, init?: RequestInit): Promise<ResourceRating> {
  const response = await fetch(`/api/ratings/${encodeURIComponent(slug)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...init?.headers },
    ...init,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || `Request failed (${response.status})`)
  }
  const result = await response.json() as { rating: ResourceRating }
  return result.rating
}

export function fetchResourceRating(slug: string, signal?: AbortSignal) {
  return getRatingResponse(slug, { signal })
}

export function saveResourceRating(slug: string, rating: number) {
  return getRatingResponse(slug, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  })
}

export function clearResourceRating(slug: string) {
  return getRatingResponse(slug, { method: "DELETE" })
}
