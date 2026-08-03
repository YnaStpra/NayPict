import sharp from "sharp"
import { rgbaToThumbHash } from "thumbhash"

// This module is responsible for server-side photo compression and thumbHash generate。

// use sharp generate preview、thumbnail、thumbHash and width and height。
export async function processPhotoImages(buffer: Buffer) {
  // Press first EXIF Orientation straighten pixels，avoid preview/thumbnail Wrong direction。
  const orientedBuffer = await sharp(buffer).autoOrient().toBuffer()
  const metadata = await sharp(orientedBuffer).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  const previewBuffer = await sharp(orientedBuffer)
    .resize({ width: 1440, height: 1440, fit: "outside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()

  const thumbnailBuffer = await sharp(previewBuffer)
    .resize({ width: 300, height: 300, fit: "outside", withoutEnlargement: true })
    .webp({ quality: 90 })
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
