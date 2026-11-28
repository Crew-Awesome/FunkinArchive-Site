const publicResourceStatusCondition = "(trim(status) = '' OR lower(trim(status)) IN ('accepted', 'approved'))"

interface ShareMetadata {
  title: string
  description: string
  url: string
  image?: string | null
  imageAlt?: string
}

interface ResourceShareRow {
  title: string
  description: string
  category: string
  file_types: string
  from_mod: string | null
  submitted_by: string
  cover_key: string | null
  cover_url: string | null
}

interface UserShareRow {
  id: string
  username: string | null
  name: string
  image: string | null
  banner: string | null
  bio: string
  submission_count: number
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!)
}

function trimDescription(value: string, maxLength = 300) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

function absoluteImageUrl(value: string | null | undefined, requestUrl: URL) {
  if (!value?.trim()) return null
  try {
    const imageUrl = new URL(value, requestUrl.origin)
    if ((imageUrl.protocol !== "https:" && imageUrl.protocol !== "http:") || imageUrl.username || imageUrl.password) return null
    return imageUrl.href
  } catch {
    return null
  }
}

function updateMeta(html: string, metadata: ShareMetadata) {
  const values: Record<string, string> = {
    "description": metadata.description,
    "og:type": "website",
    "og:title": metadata.title,
    "og:description": metadata.description,
    "og:url": metadata.url,
    "og:site_name": "FunkinArchive",
    "twitter:card": metadata.image ? "summary_large_image" : "summary",
    "twitter:title": metadata.title,
    "twitter:description": metadata.description,
  }
  if (metadata.image) {
    values["og:image"] = metadata.image
    values["og:image:alt"] = metadata.imageAlt ?? metadata.title
    values["twitter:image"] = metadata.image
  }

  const remaining = new Set(Object.keys(values))
  let output = html.replace(/<meta\b[^>]*>/gi, (tag) => {
    const key = tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]
    if (!key || !(key in values)) return tag
    remaining.delete(key)
    const content = escapeHtml(values[key])
    if (/\bcontent=["'][^"']*["']/i.test(tag)) {
      return tag.replace(/\bcontent=["'][^"']*["']/i, `content="${content}"`)
    }
    return tag.replace(/\s*\/?>$/, ` content="${content}" />`)
  })

  const extraTags = [...remaining].map((key) => {
    const kind = key.startsWith("og:") ? "property" : "name"
    return `<meta ${kind}="${key}" content="${escapeHtml(values[key])}" />`
  }).join("\n    ")
  if (extraTags) output = output.replace(/<\/head>/i, `    ${extraTags}\n  </head>`)
  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`)
  return output
}

async function getResourceMetadata(env: Env, slug: string, url: URL): Promise<ShareMetadata | null> {
  const row = await env.DB.prepare(`
    SELECT title, description, category, file_types, from_mod, submitted_by, cover_key, cover_url
    FROM resources
    WHERE ${publicResourceStatusCondition} AND slug = ?
    LIMIT 1
  `).bind(slug).first<ResourceShareRow>()
  if (!row) return null

  let fileTypes: string[] = []
  try {
    const parsed: unknown = JSON.parse(row.file_types)
    if (Array.isArray(parsed)) fileTypes = parsed.filter((item): item is string => typeof item === "string")
  } catch {
    // Older or malformed rows still get a useful preview from their category.
  }
  const type = fileTypes[0]?.trim() || row.category.trim()
  const details = [type, row.from_mod?.trim()].filter(Boolean).join(" · ")
  const description = trimDescription([details, row.description.trim(), `Submitted by ${row.submitted_by}.`].filter(Boolean).join(" — "))
  const image = row.cover_key
    ? new URL(`/api/assets?key=${encodeURIComponent(row.cover_key)}`, url.origin).href
    : absoluteImageUrl(row.cover_url, url)

  return {
    title: `${row.title} | FunkinArchive`,
    description,
    url: `${url.origin}${url.pathname}`,
    image,
    imageAlt: `Cover art for ${row.title}`,
  }
}

async function getUserMetadata(env: Env, usernameOrId: string, url: URL): Promise<ShareMetadata | null> {
  const row = await env.DB.prepare(`
    SELECT users.id, users.username, users.name, users.image, users.banner, users.bio,
      (SELECT COUNT(*) FROM resources WHERE ${publicResourceStatusCondition} AND submitted_by_user_id = users.id) AS submission_count
    FROM "user" AS users
    WHERE users.username = ? COLLATE NOCASE OR users.id = ?
    LIMIT 1
  `).bind(usernameOrId, usernameOrId).first<UserShareRow>()
  if (!row) return null

  const username = row.username
  const profileLabel = username ? `@${username}` : row.name
  const count = Number(row.submission_count ?? 0)
  const countLabel = `${count} public ${count === 1 ? "submission" : "submissions"}`
  const description = trimDescription([`${row.name}${username ? ` (@${username})` : ""} · ${countLabel} on FunkinArchive.`, row.bio].filter(Boolean).join(" "))
  const image = absoluteImageUrl(row.banner, url) ?? absoluteImageUrl(row.image, url)

  return {
    title: `${profileLabel} | FunkinArchive`,
    description,
    url: `${url.origin}${url.pathname}`,
    image,
    imageAlt: `Profile image for ${profileLabel}`,
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next()
  const requestUrl = new URL(context.request.url)
  if (context.request.method !== "GET" || response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) {
    return response
  }

  let match = requestUrl.pathname.match(/^\/resources\/([^/]+)\/?$/)
  let metadata: ShareMetadata | null = null
  if (match) {
    try {
      metadata = await getResourceMetadata(context.env, decodeURIComponent(match[1]), requestUrl)
    } catch {
      return response
    }
  } else {
    match = requestUrl.pathname.match(/^\/users\/([^/]+)\/?$/)
    if (match) {
      try {
        metadata = await getUserMetadata(context.env, decodeURIComponent(match[1]), requestUrl)
      } catch {
        return response
      }
    }
  }
  if (!metadata) return response

  const headers = new Headers(response.headers)
  headers.delete("content-length")
  headers.set("cache-control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300")
  return new Response(updateMeta(await response.text(), metadata), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
