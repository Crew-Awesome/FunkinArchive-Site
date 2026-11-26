export interface ResourceListing {
  id: string
  slug: string
  title: string
  version: string
  submittedBy: string
  submittedByUserId: string | null
  submittedByUsername?: string | null
  submittedByImage: string | null
  ratingAverage?: number | null
  ratingCount?: number
  fromMod: string | null
  originalBy: string | null
  recreationBy: string | null
  description: string
  category: string
  status: string
  tags: string[]
  alternateDownloads: string[]
  fileType: string | null
  coverUrl: string | null
  downloadUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface ResourceFacets {
  types: string[]
}

export interface ResourcesResponse {
  resources: ResourceListing[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  facets: ResourceFacets
}

export interface ResourceRating {
  average: number | null
  count: number
  userRating: number | null
}

export interface PublicProfile {
  id: string
  username: string
  name: string
  image: string | null
  banner: string | null
  bio: string
  resources: ResourceListing[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  facets: ResourceFacets
}

export type PublicProfilePreview = Pick<PublicProfile, "id" | "username" | "name" | "image" | "banner" | "bio" | "total">

export interface ResourceSubmissionInput {
  title: string
  fromMod: string
  version: string
  type: string
  originalBy: string
  recreationBy: string
  coverUrl: string
  downloadUrl: string
  alternateDownloads: string[]
  description: string
  tags: string[]
}

export type SortOrder = "newest" | "oldest" | "updated" | "least-updated" | "alphabetical" | "reverse-alphabetical" | "highest-rated" | "lowest-rated" | "most-rated" | "fewest-ratings"

export const knownResourceTypes = ["Chroms", "DWPs", "FLAs", "FLMs", "FLPs", "MIDIs", "SF2s", "Other"] as const

export function getResourceTypes(resource: Pick<ResourceListing, "category" | "fileType">) {
  const primaryType = resource.fileType?.trim() || resource.category.trim()
  return primaryType ? [primaryType] : []
}
