import sharp from "sharp"
import { rgbaToThumbHash } from "thumbhash"

// This module is responsible for server-side photo compression and thumbHash generation.

// Use sharp to generate high-quality preview, thumbnail, thumbHash, and width/height metadata.
export async function processPhotoImages(buffer: Buffer) {
  // Respect EXIF Orientation to straighten pixels, avoiding preview/thumbnail orientation mismatch.
  const orientedBuffer = await sharp(buffer).autoOrient().toBuffer()
  const metadata = await sharp(orientedBuffer).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  // High-fidelity preview buffer (1920px max bound with progressive mozjpeg compression)
  const previewBuffer = await sharp(orientedBuffer)
    .resize({ width: 1920, height: 1920, fit: "outside", withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true, mozjpeg: true })
    .toBuffer()

  // Crisp thumbnail buffer (400px max bound with WebP quality 85 and effort 6)
  const thumbnailBuffer = await sharp(previewBuffer)
    .resize({ width: 400, height: 400, fit: "outside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 6 })
    .toBuffer()

  const hashImage = await sharp(thumbnailBuffer)
    .resize(100, 100, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const bytes = rgbaToThumbHash(hashImage.info.width, hashImage.info.height, hashImage.data)
  const thumbHash = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

  return {
    previewBuffer,
    thumbnailBuffer,
    width,
    height,
    thumbHash,
  }
}
