import sharp from "sharp"
import { rgbaToThumbHash } from "thumbhash"

// This module is responsible for multi-resolution image derivative processing, AVIF/WebP encoding, and ThumbHash generation.

export interface ProcessedPhotoImages {
  previewBuffer: Buffer
  thumbnailBuffer: Buffer
  mediumBuffer?: Buffer
  width: number
  height: number
  thumbHash: string
}

// Use sharp to generate multi-resolution derivatives (2400w preview, 1200w medium, 400w thumbnail), AVIF/WebP encoding, and thumbHash metadata.
export async function processPhotoImages(buffer: Buffer): Promise<ProcessedPhotoImages> {
  // Respect EXIF Orientation to straighten pixels, avoiding preview/thumbnail orientation mismatch.
  const orientedBuffer = await sharp(buffer).autoOrient().toBuffer()
  const metadata = await sharp(orientedBuffer).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  // 1. High-fidelity desktop lightbox preview (2400px max bound with progressive MozJPEG for maximum browser compatibility)
  const previewBuffer = await sharp(orientedBuffer)
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true, mozjpeg: true })
    .toBuffer()

  // 2. Medium responsive derivative (1200px max bound with high-efficiency WebP)
  const mediumBuffer = await sharp(orientedBuffer)
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 5 })
    .toBuffer()

  // 3. Crisp gallery grid thumbnail (400px max bound with high-efficiency WebP effort 6)
  const thumbnailBuffer = await sharp(mediumBuffer)
    .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 6 })
    .toBuffer()

  // 4. ThumbHash placeholder generation (100x100 raw RGBA)
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
    mediumBuffer,
    thumbnailBuffer,
    width,
    height,
    thumbHash,
  }
}
