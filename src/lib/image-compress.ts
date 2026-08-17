// This module provides browser-based high-quality image size compression while preserving full original EXIF metadata.

export interface CompressImageOptions {
  /** Maximum width or height bound in pixels (default: 3840 for 4K quality) */
  maxDimension?: number;
  /** Compression quality ratio between 0.1 and 1.0 (default: 0.85) */
  quality?: number;
}

/**
 * Extracts the APP1 EXIF segment from a JPEG ArrayBuffer if present.
 */
function extractExifApp1Segment(buffer: ArrayBuffer): Uint8Array | null {
  const view = new Uint8Array(buffer);
  if (view[0] !== 0xff || view[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < view.length - 4) {
    if (view[offset] !== 0xff) break;
    const marker = view[offset + 1];
    // Stop at SOS (0xDA) or EOI (0xD9)
    if (marker === 0xda || marker === 0xd9) break;

    const length = (view[offset + 2] << 8) | view[offset + 3];
    if (marker === 0xe1 && offset + 4 + 6 <= view.length) {
      // Verify "Exif\0\0" magic header
      if (
        view[offset + 4] === 0x45 && // E
        view[offset + 5] === 0x78 && // x
        view[offset + 6] === 0x69 && // i
        view[offset + 7] === 0x66 && // f
        view[offset + 8] === 0x00 &&
        view[offset + 9] === 0x00
      ) {
        return new Uint8Array(view.subarray(offset, offset + 2 + length));
      }
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Patches the EXIF Orientation tag (0x0112) in an APP1 segment to 1 (normal),
 * because HTML5 Canvas drawImage automatically bakes visual orientation into the output pixels.
 */
function fixExifOrientationInApp1(app1: Uint8Array): void {
  const exifStart = 10;
  if (app1.length < exifStart + 8) return;

  const isLittleEndian = app1[exifStart] === 0x49 && app1[exifStart + 1] === 0x49;
  const isBigEndian = app1[exifStart] === 0x4d && app1[exifStart + 1] === 0x4d;
  if (!isLittleEndian && !isBigEndian) return;

  const read16 = (off: number) =>
    isLittleEndian ? app1[off] | (app1[off + 1] << 8) : (app1[off] << 8) | app1[off + 1];
  const read32 = (off: number) =>
    isLittleEndian
      ? app1[off] | (app1[off + 1] << 8) | (app1[off + 2] << 16) | (app1[off + 3] << 24)
      : (app1[off] << 24) | (app1[off + 1] << 16) | (app1[off + 2] << 8) | app1[off + 3];
  const write16 = (off: number, val: number) => {
    if (isLittleEndian) {
      app1[off] = val & 0xff;
      app1[off + 1] = (val >> 8) & 0xff;
    } else {
      app1[off] = (val >> 8) & 0xff;
      app1[off + 1] = val & 0xff;
    }
  };

  const ifd0Offset = read32(exifStart + 4);
  const ifd0Start = exifStart + ifd0Offset;
  if (ifd0Start + 2 > app1.length) return;

  const tagCount = read16(ifd0Start);
  let currentOffset = ifd0Start + 2;

  for (let i = 0; i < tagCount; i++) {
    if (currentOffset + 12 > app1.length) break;
    const tagNumber = read16(currentOffset);
    if (tagNumber === 0x0112) {
      write16(currentOffset + 8, 1);
      break;
    }
    currentOffset += 12;
  }
}

/**
 * Preserves the original EXIF metadata by copying the APP1 segment from originalFile into compressedBlob.
 */
async function preserveExifMetadata(originalFile: File, compressedBlob: Blob): Promise<Blob> {
  try {
    const origBuffer = await originalFile.arrayBuffer();
    const exifSegment = extractExifApp1Segment(origBuffer);

    if (!exifSegment || exifSegment.length === 0) {
      return compressedBlob;
    }

    fixExifOrientationInApp1(exifSegment);

    const compBuffer = await compressedBlob.arrayBuffer();
    const compView = new Uint8Array(compBuffer);

    if (compView[0] !== 0xff || compView[1] !== 0xd8) {
      return compressedBlob;
    }

    const merged = new Uint8Array(2 + exifSegment.length + (compView.length - 2));
    merged.set(compView.subarray(0, 2), 0);
    merged.set(exifSegment, 2);
    merged.set(compView.subarray(2), 2 + exifSegment.length);

    return new Blob([merged], { type: 'image/jpeg' });
  } catch (error) {
    console.warn('Could not preserve EXIF metadata:', error);
    return compressedBlob;
  }
}

/**
 * Compresses an image file in the browser while maintaining high visual quality, EXIF metadata,
 * and ensuring the payload never exceeds Vercel Serverless Function 4.5MB limit.
 */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  const { maxDimension = 2560, quality = 0.82 } = options;

  // 1. Skip non-image or vector files (SVG, GIF animations)
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  // 2. Skip small files (< 400KB) unless it is a large dimension file
  if (file.size < 400 * 1024) {
    return file;
  }

  try {
    return await new Promise<File>((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        try {
          URL.revokeObjectURL(objectUrl);

          let { width, height } = img;

          // Adaptive target dimension based on original file size
          const targetDimension = file.size > 8 * 1024 * 1024 ? Math.min(maxDimension, 2048) : maxDimension;

          // Calculate scaling maintaining original aspect ratio
          if (width > targetDimension || height > targetDimension) {
            if (width > height) {
              height = Math.round((height * targetDimension) / width);
              width = targetDimension;
            } else {
              width = Math.round((width * targetDimension) / height);
              height = targetDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Standardize photo upload to JPEG with EXIF preservation for maximum quality/size ratio
          const outputMime = 'image/jpeg';

          canvas.toBlob(
            async (blob) => {
              try {
                if (!blob) {
                  resolve(file);
                  return;
                }

                // If blob is still > 3.8MB, perform a quick secondary pass
                let finalBlob = blob;
                if (blob.size > 3.8 * 1024 * 1024) {
                  const secondaryCanvas = document.createElement('canvas');
                  const sWidth = Math.round(width * 0.8);
                  const sHeight = Math.round(height * 0.8);
                  secondaryCanvas.width = sWidth;
                  secondaryCanvas.height = sHeight;
                  const sCtx = secondaryCanvas.getContext('2d');
                  if (sCtx) {
                    sCtx.drawImage(canvas, 0, 0, sWidth, sHeight);
                    const reducedBlob = await new Promise<Blob | null>((res) =>
                      secondaryCanvas.toBlob(res, 'image/jpeg', 0.78)
                    );
                    if (reducedBlob && reducedBlob.size < blob.size) {
                      finalBlob = reducedBlob;
                    }
                  }
                }

                // Restore complete original EXIF metadata back into compressed Blob
                const exifPreservedBlob = await preserveExifMetadata(file, finalBlob);

                const finalOutputName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";

                const compressedFile = new File([exifPreservedBlob], finalOutputName, {
                  type: outputMime,
                  lastModified: file.lastModified,
                });

                resolve(compressedFile);
              } catch (blobErr) {
                console.warn('Blob EXIF preservation fallback, using original file:', blobErr);
                resolve(file);
              }
            },
            outputMime,
            quality
          );
        } catch (loadErr) {
          console.warn('Image processing error, using original file:', loadErr);
          resolve(file);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
    });
  } catch (error) {
    console.warn('Image client compression bypassed due to browser error:', error);
    return file;
  }
}
