const apiKeys = ["q", "type", "category", "fileType", "sort", "page"] as const

export function buildResourcesApiUrl(params: URLSearchParams) {
  const query = new URLSearchParams()
  for (const key of apiKeys) {
    const value = params.get(key)
    if (value && value !== "all" && !(key === "sort" && value === "newest")) query.set(key, value)
  }
  const search = query.toString()
  return search ? `/api/resources?${search}` : "/api/resources"
}
