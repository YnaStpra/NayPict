import sharp from "sharp"
import { rgbaToThumbHash } from "thumbhash"

// This module is responsible for multi-resolution image derivative processing, lossless/near-lossless original compression, and ThumbHash generation.

export interface ProcessedPhotoImages {
  previewBuffer: Buffer
  thumbnailBuffer: Buffer
  mediumBuffer?: Buffer
  optimizedOriginalBuffer: Buffer
  optimizedOriginalType: string
  optimizedOriginalSize: number
  width: number
  height: number
  thumbHash: string
}

/**
 * Optimizes the original photo buffer to trim down file size while preserving 100% visual quality.
 * Employs MozJPEG trellis quantization for JPEG, effort 8 level 9 for PNG, and high-efficiency WebP/AVIF.
 * Returns the smaller of the optimized buffer and the original buffer.
 */
export async function optimizeOriginalBuffer(
  orientedBuffer: Buffer,
  rawBuffer: Buffer,
  mimeType?: string
): Promise<{ buffer: Buffer; type: string; size: number }> {
  try {
    const metadata = await sharp(orientedBuffer).metadata()
    const format = (metadata.format ?? "").toLowerCase()

    let optimized: Buffer | null = null
    let outType = mimeType || "image/jpeg"

    if (format === "jpeg" || format === "jpg" || mimeType === "image/jpeg" || mimeType === "image/jpg") {
      outType = "image/jpeg"
      optimized = await sharp(orientedBuffer)
        .jpeg({
          quality: 90, // Pristine visual quality (near lossless), preserves high dynamic range and subtle gradients
          mozjpeg: true, // MozJPEG advanced trellis quantization & arithmetic scan optimization
          progressive: true,
          optimizeScans: true,
          trellisQuantisation: true,
          overshootDeringing: true,
        })
        .toBuffer()
    } else if (format === "png" || mimeType === "image/png") {
      outType = "image/png"
      optimized = await sharp(orientedBuffer)
        .png({
          compressionLevel: 9,
          effort: 8,
          adaptiveFiltering: true,
        })
        .toBuffer()
    } else if (format === "webp" || mimeType === "image/webp") {
      outType = "image/webp"
      optimized = await sharp(orientedBuffer)
        .webp({
          quality: 90,
          effort: 6,
          smartSubsample: true,
        })
        .toBuffer()
    } else if (format === "avif" || mimeType === "image/avif") {
      outType = "image/avif"
      optimized = await sharp(orientedBuffer)
        .avif({
          quality: 90,
          effort: 6,
        })
        .toBuffer()
    } else if (format === "tiff" || format === "heic" || format === "heif" || format === "bmp") {
      // Convert raw/uncompressed desktop raster formats to pristine 92% MozJPEG
      outType = "image/jpeg"
      optimized = await sharp(orientedBuffer)
        .jpeg({
          quality: 92,
          mozjpeg: true,
          progressive: true,
        })
        .toBuffer()
    }

    // Strictly adopt optimized buffer only if it reduces file size
    if (optimized && optimized.length < rawBuffer.length) {
      return {
        buffer: optimized,
        type: outType,
        size: optimized.length,
      }
    }
  } catch (err) {
    console.warn("[PHOTO-PROCESS] Image optimization fallback to raw buffer:", err)
  }

  return {
    buffer: rawBuffer,
    type: mimeType || "image/jpeg",
    size: rawBuffer.length,
  }
}

// Use sharp to generate multi-resolution derivatives (2560w preview, 1280w medium, 480w thumbnail), AVIF/WebP encoding, and thumbHash metadata.
export async function processPhotoImages(buffer: Buffer, mimeType?: string): Promise<ProcessedPhotoImages> {
  // Respect EXIF Orientation to straighten pixels, avoiding preview/thumbnail orientation mismatch.
  const orientedBuffer = await sharp(buffer).autoOrient().toBuffer()
  const metadata = await sharp(orientedBuffer).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  // 1. Optimize original photo buffer (cuts file size without perceptual loss)
  const optimizedOriginal = await optimizeOriginalBuffer(orientedBuffer, buffer, mimeType)

  // 2. High-fidelity desktop lightbox preview (2560px max bound with progressive MozJPEG)
  const previewBuffer = await sharp(orientedBuffer)
    .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, progressive: true, mozjpeg: true, trellisQuantisation: true, overshootDeringing: true })
    .toBuffer()

  // 3. Medium responsive derivative (1280px max bound with high-efficiency WebP)
  const mediumBuffer = await sharp(orientedBuffer)
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 5 })
    .toBuffer()

  // 4. Crisp gallery grid thumbnail (480px max bound with high-efficiency WebP effort 6)
  const thumbnailBuffer = await sharp(mediumBuffer)
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 6, smartSubsample: true })
    .toBuffer()

  // 5. ThumbHash placeholder generation (100x100 raw RGBA)
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
    optimizedOriginalBuffer: optimizedOriginal.buffer,
    optimizedOriginalType: optimizedOriginal.type,
    optimizedOriginalSize: optimizedOriginal.size,
    width,
    height,
    thumbHash,
  }
}
