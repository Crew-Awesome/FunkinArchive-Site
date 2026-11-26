export interface PersonListing {
  id: string
  username: string | null
  name: string
  image: string | null
  bio: string
  banner: string | null
  submissionCount: number
  latestResourceTitle: string | null
  latestResourceCoverKey: string | null
  latestResourceCoverUrl: string | null
}

export interface PeopleResponse {
  people: PersonListing[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export async function fetchPeople(params: URLSearchParams, signal?: AbortSignal): Promise<PeopleResponse> {
  const query = params.toString()
  const response = await fetch(`/api/community/users${query ? `?${query}` : ""}`, {
    signal,
    headers: { Accept: "application/json" },
  })
  if (!response.ok) throw new Error("People could not be loaded. Try again.")
  return response.json() as Promise<PeopleResponse>
}

export function personCoverUrl(person: PersonListing) {
  if (person.banner) return person.banner
  if (person.latestResourceCoverKey) return `/api/assets?key=${encodeURIComponent(person.latestResourceCoverKey)}`
  return person.latestResourceCoverUrl
}
