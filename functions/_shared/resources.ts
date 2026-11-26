export interface ResourceRow {
  id: string
  slug: string
  title: string
  version: string
  submitted_by: string
  submitted_by_user_id: string | null
  account_submitter_name?: string | null
  account_submitter_image?: string | null
  account_submitter_username?: string | null
  from_mod: string | null
  original_by: string | null
  recreation_by: string | null
  description: string
  category: string
  status: string
  tags: string
  alternate_downloads: string
  file_types: string
  cover_key: string | null
  download_key: string | null
  cover_url: string | null
  download_url: string | null
  created_at: string
  updated_at: string
}

export const publicResourceStatusCondition = "(trim(status) = '' OR lower(trim(status)) IN ('accepted', 'approved'))"

function parseJsonList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

export function toResource(row: ResourceRow) {
  const assetUrl = (key: string) => `/api/assets?key=${encodeURIComponent(key)}`
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    version: row.version,
    submittedBy: row.account_submitter_name ?? row.submitted_by,
    submittedByUserId: row.submitted_by_user_id,
    submittedByUsername: row.account_submitter_username,
    submittedByImage: row.account_submitter_image ?? null,
    fromMod: row.from_mod,
    originalBy: row.original_by,
    recreationBy: row.recreation_by,
    description: row.description,
    category: row.category,
    status: row.status,
    tags: parseJsonList(row.tags),
    alternateDownloads: parseJsonList(row.alternate_downloads),
    fileType: parseJsonList(row.file_types)[0] ?? null,
    coverUrl: row.cover_key ? assetUrl(row.cover_key) : row.cover_url,
    downloadUrl: row.download_key ? `${assetUrl(row.download_key)}&download=1` : row.download_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
