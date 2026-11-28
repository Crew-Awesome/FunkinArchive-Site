import { createAuth, type AuthEnv } from "../../_shared/auth"
import { accountImageKey, accountImageUrl } from "../../_shared/account-assets"
import { userRestrictionResponse } from "../../_shared/user-restrictions"

const maxImageSize = 5 * 1024 * 1024
const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
])

function matchesImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (contentType === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  if (contentType === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  return false
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Upload request origin was not allowed." }, { status: 403 })
  }

  const auth = createAuth(env, request, waitUntil)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ message: "You must be signed in to upload an image." }, { status: 401 })
  const restriction = await userRestrictionResponse(env.DB, session.user.id, "community")
  if (restriction) return restriction

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ message: "Choose an image file to upload." }, { status: 400 })
  }

  const file = formData.get("image")
  if (!(file instanceof File)) return Response.json({ message: "Choose an image file to upload." }, { status: 400 })
  const extension = allowedImageTypes.get(file.type)
  if (!extension) return Response.json({ message: "Use a JPG, PNG, or WebP image." }, { status: 400 })
  if (file.size === 0 || file.size > maxImageSize) return Response.json({ message: "Images must be smaller than 5 MB." }, { status: 413 })

  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!matchesImageSignature(signature, file.type)) {
    return Response.json({ message: "The selected file does not match its image type." }, { status: 400 })
  }

  const key = `${accountImageKey(session.user.id)}.${extension}`
  try {
    await env.RESOURCE_ASSETS.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { uploadedBy: session.user.id },
    })
  } catch {
    return Response.json({ message: "Image storage is unavailable. Try again later." }, { status: 503 })
  }

  return Response.json({ url: accountImageUrl(key) }, { headers: { "Cache-Control": "no-store" } })
}
