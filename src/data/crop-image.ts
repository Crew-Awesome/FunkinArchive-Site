import type { ImageCropSettings } from "@/components/image-cropper"

export const maxSourceImageSize = 20 * 1024 * 1024
export const maxUploadedImageSize = 5 * 1024 * 1024

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality))
}

export async function cropAndCompressImage(
  file: File,
  crop: ImageCropSettings,
  output: { width: number; height: number },
): Promise<File> {
  if (file.size > maxSourceImageSize) throw new Error("Choose an image smaller than 20 MB.")

  const image = await createImageBitmap(file)
  try {
    if (image.width > 12_000 || image.height > 12_000 || image.width * image.height > 60_000_000) {
      throw new Error("This image is too large to crop. Choose a smaller image.")
    }
    if (!crop.croppedAreaPixels) throw new Error("Adjust the crop area before saving.")
    const { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight } = crop.croppedAreaPixels

    const canvas = document.createElement("canvas")
    canvas.width = output.width
    canvas.height = output.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Your browser could not prepare this image.")
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, output.width, output.height)

    let blob: Blob | null = null
    for (const quality of [0.86, 0.76, 0.66, 0.56]) {
      blob = await canvasToWebp(canvas, quality)
      if (blob && blob.size <= maxUploadedImageSize) break
    }
    if (!blob) throw new Error("Your browser could not compress this image.")
    if (blob.size > maxUploadedImageSize) throw new Error("The cropped image is still too large to upload.")

    const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg"
    return new File([blob], `funkin-archive-image.${extension}`, { type: blob.type || "image/jpeg" })
  } finally {
    image.close()
  }
}
