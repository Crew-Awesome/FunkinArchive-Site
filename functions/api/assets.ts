export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const key = url.searchParams.get("key")
  if (!key || key.startsWith("/") || key.includes("..")) {
    return Response.json({ error: "Asset not found." }, { status: 404 })
  }

  const object = await env.RESOURCE_ASSETS.get(key)
  if (!object) return Response.json({ error: "Asset not found." }, { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("etag", object.httpEtag)
  headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800")
  if (url.searchParams.get("download") === "1") {
    const filename = key.split("/").pop() ?? "download"
    headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  }
  return new Response(object.body, { headers })
}
