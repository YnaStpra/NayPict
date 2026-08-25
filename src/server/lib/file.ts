// This module provides tools and methods related to file name processing。

// Split filename and extension，It is convenient to append a timestamp before the extension when the name is repeated.。
function splitFileName(name: string) {
  const index = name.lastIndexOf('.');

  if (index <= 0) {
    return {
      baseName: name,
      extName: ''
    };
  }

  return {
    baseName: name.slice(0, index),
    extName: name.slice(index)
  };
}

// Formatted as a timestamp for file name conflicts：year month day_hours minutes seconds_millisecond。
function formatFileTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const millisecond = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}${month}${day}_${hour}${minute}${second}_${millisecond}`;
}

// Generate based on original file name Content-Disposition。
function buildContentDisposition(name: string) {
  const encodedName = encodeURIComponent(name)
    .replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  return `inline; filename*=UTF-8''${encodedName}`;
}

export interface MagicBytesResult {
  valid: boolean;
  format?: string;
  mimeType?: string;
}

/**
 * Validates the true binary magic bytes of an uploaded file buffer.
 * Rejects polyglot scripts, disguised executables, or corrupted uploads.
 */
function validateImageMagicBytes(buffer: Buffer | Uint8Array): MagicBytesResult {
  if (!buffer || buffer.length < 8) {
    return { valid: false };
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: "jpeg", mimeType: "image/jpeg" };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, format: "png", mimeType: "image/png" };
  }

  // 3. WebP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, format: "webp", mimeType: "image/webp" };
  }

  // 4. GIF: GIF87a or GIF89a (47 49 46 38 37 61 or 47 49 46 38 39 61)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { valid: true, format: "gif", mimeType: "image/gif" };
  }

  // 5. TIFF: II*. (49 49 2A 00) or MM.* (4D 4D 00 2A)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return { valid: true, format: "tiff", mimeType: "image/tiff" };
  }

  // 6. AVIF / HEIC / HEIF / MP4 container: bytes 4-8 = 'ftyp' (66 74 79 70)
  if (
    buffer.length >= 16 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = Buffer.from(buffer.slice(8, 16)).toString("ascii").toLowerCase();
    if (brand.includes("avif") || brand.includes("avis")) {
      return { valid: true, format: "avif", mimeType: "image/avif" };
    }
    if (brand.includes("heic") || brand.includes("heix") || brand.includes("mif1") || brand.includes("msf1")) {
      return { valid: true, format: "heic", mimeType: "image/heic" };
    }
    if (brand.includes("isom") || brand.includes("mp42")) {
      return { valid: true, format: "mp4", mimeType: "video/mp4" };
    }
  }

  return { valid: false };
}

export { buildContentDisposition, formatFileTimestamp, splitFileName, validateImageMagicBytes };

