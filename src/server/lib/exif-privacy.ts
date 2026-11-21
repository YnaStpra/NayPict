import zlib from 'node:zlib';

/**
 * Strips GPS coordinates and geolocation tags from image buffers (JPEG, WebP, PNG, TIFF)
 * while preserving camera metadata (Make, Model, ISO, Aperture, Shutter Speed, Focal Length, Date/Time).
 */

function sanitizeTiffGps(buf: Buffer, tiffStart: number): boolean {
  if (tiffStart + 8 > buf.length) return false;

  const isLittle = buf[tiffStart] === 0x49 && buf[tiffStart + 1] === 0x49; // "II"
  const isBig = buf[tiffStart] === 0x4D && buf[tiffStart + 1] === 0x4D; // "MM"
  if (!isLittle && !isBig) return false;

  const read16 = (off: number) => (isLittle ? buf.readUInt16LE(off) : buf.readUInt16BE(off));
  const read32 = (off: number) => (isLittle ? buf.readUInt32LE(off) : buf.readUInt32BE(off));
  const write16 = (off: number, val: number) =>
    isLittle ? buf.writeUInt16LE(val, off) : buf.writeUInt16BE(val, off);

  const ifd0Offset = read32(tiffStart + 4);
  const ifd0Start = tiffStart + ifd0Offset;
  if (ifd0Start + 2 > buf.length) return false;

  const tagCount = read16(ifd0Start);
  let cur = ifd0Start + 2;
  let modified = false;

  for (let i = 0; i < tagCount; i++) {
    if (cur + 12 > buf.length) break;
    const tag = read16(cur);

    if (tag === 0x8825) {
      // Found GPSInfo IFD pointer tag (0x8825 / 34853)
      const gpsIfdOffset = read32(cur + 8);
      const gpsIfdStart = tiffStart + gpsIfdOffset;

      if (gpsIfdStart + 2 <= buf.length) {
        const gpsTagCount = read16(gpsIfdStart);
        write16(gpsIfdStart, 0);

        let gCur = gpsIfdStart + 2;
        for (let j = 0; j < gpsTagCount && gCur + 12 <= buf.length; j++) {
          buf.fill(0, gCur, gCur + 12);
          gCur += 12;
        }
      }

      // Compact IFD0: shift remaining tag entries left by 12 bytes
      const remainingBytes = (tagCount - 1 - i) * 12 + 4; // includes next IFD offset (4 bytes)
      buf.copy(buf, cur, cur + 12, cur + 12 + remainingBytes);

      // Decrement tag count
      write16(ifd0Start, tagCount - 1);
      modified = true;
      break;
    }
    cur += 12;
  }

  return modified;
}

/**
 * Replaces GPS tags in XMP UTF-8 string with whitespace of exact identical length,
 * ensuring byte offsets and XML document structure remain 100% valid.
 */
function sanitizeXmpString(xmp: string): string {
  return xmp
    .replace(/(\b(?:exif:GPS[A-Za-z]+|gps:[A-Za-z]+)\s*=\s*"[^"]*")/g, (m) => ' '.repeat(m.length))
    .replace(/(<(?:exif:GPS[A-Za-z]+|gps:[A-Za-z]+)[^>]*>[\s\S]*?<\/(?:exif:GPS[A-Za-z]+|gps:[A-Za-z]+)>)/gi, (m) => ' '.repeat(m.length));
}

/**
 * Scans a JPEG buffer for EXIF APP1 and XMP APP1 segments and sanitizes GPS geolocation.
 */
function sanitizeJpegBuffer(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return buffer;
  }

  const copy = Buffer.from(buffer);
  let pos = 2;

  while (pos + 4 <= copy.length) {
    if (copy[pos] !== 0xFF) break;
    const marker = copy[pos + 1];

    // End of Image or Start of Scan
    if (marker === 0xD9 || marker === 0xDA) break;

    const segLen = copy.readUInt16BE(pos + 2);
    if (segLen < 2 || pos + 2 + segLen > copy.length) break;

    // APP1 Marker (0xE1)
    if (marker === 0xE1) {
      const segStart = pos + 4;
      // 1. Standard Exif APP1
      if (
        segLen >= 8 &&
        copy[segStart] === 0x45 && // E
        copy[segStart + 1] === 0x78 && // x
        copy[segStart + 2] === 0x69 && // i
        copy[segStart + 3] === 0x66 && // f
        copy[segStart + 4] === 0x00 &&
        copy[segStart + 5] === 0x00
      ) {
        const tiffStart = segStart + 6;
        sanitizeTiffGps(copy, tiffStart);
      }
      // 2. Adobe XMP APP1
      else if (
        segLen >= 31 &&
        copy.toString('utf8', segStart, segStart + 28) === 'http://ns.adobe.com/xap/1.0/'
      ) {
        const xmpBytes = copy.subarray(segStart + 29, pos + 2 + segLen);
        const origStr = xmpBytes.toString('utf8');
        const sanitized = sanitizeXmpString(origStr);
        if (sanitized !== origStr) {
          Buffer.from(sanitized, 'utf8').copy(copy, segStart + 29);
        }
      }
    }

    pos += 2 + segLen;
  }

  return copy;
}

/**
 * Scans a WebP buffer for EXIF chunks and sanitizes GPS geolocation.
 */
function sanitizeWebpBuffer(buffer: Buffer): Buffer {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return buffer;
  }

  const copy = Buffer.from(buffer);
  let pos = 12;

  while (pos + 8 <= copy.length) {
    const chunkType = copy.toString('ascii', pos, pos + 4);
    const chunkSize = copy.readUInt32LE(pos + 4);
    const chunkDataStart = pos + 8;

    if (chunkType === 'EXIF' && chunkDataStart + chunkSize <= copy.length) {
      let tiffStart = chunkDataStart;
      // Check if chunk starts with "Exif\0\0"
      if (
        chunkSize >= 6 &&
        copy[chunkDataStart] === 0x45 &&
        copy[chunkDataStart + 1] === 0x78 &&
        copy[chunkDataStart + 2] === 0x69 &&
        copy[chunkDataStart + 3] === 0x66 &&
        copy[chunkDataStart + 4] === 0x00 &&
        copy[chunkDataStart + 5] === 0x00
      ) {
        tiffStart = chunkDataStart + 6;
      }
      sanitizeTiffGps(copy, tiffStart);
    }

    pos += 8 + chunkSize + (chunkSize % 2 === 1 ? 1 : 0);
  }

  return copy;
}

/**
 * Scans a PNG buffer for eXIf chunks and sanitizes GPS geolocation.
 */
function sanitizePngBuffer(buffer: Buffer): Buffer {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length < 8 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4E ||
    buffer[3] !== 0x47
  ) {
    return buffer;
  }

  const copy = Buffer.from(buffer);
  let pos = 8;

  while (pos + 12 <= copy.length) {
    const length = copy.readUInt32BE(pos);
    const type = copy.toString('ascii', pos + 4, pos + 8);
    const dataStart = pos + 8;

    if (type === 'eXIf' && dataStart + length <= copy.length) {
      const modified = sanitizeTiffGps(copy, dataStart);
      if (modified) {
        // Recalculate CRC32 over Chunk Type + Data
        const crcTarget = copy.subarray(pos + 4, dataStart + length);
        const newCrc = (zlib as any).crc32 ? (zlib as any).crc32(crcTarget) : 0;
        copy.writeUInt32BE(newCrc, dataStart + length);
      }
    }

    if (type === 'IEND') break;
    pos += 12 + length;
  }

  return copy;
}

/**
 * Binary GPS Sanitizer: strips binary GPS tags from image buffers while preserving camera specs.
 */
export function stripGpsFromImageBuffer(buffer: Buffer, mimeType?: string): Buffer {
  if (!buffer || buffer.length === 0) {
    return buffer;
  }

  // Detect format by magic bytes or mimeType
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    return sanitizeJpegBuffer(buffer);
  }

  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return sanitizeWebpBuffer(buffer);
  }

  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return sanitizePngBuffer(buffer);
  }

  // Direct TIFF
  if (
    buffer.length >= 8 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4D && buffer[1] === 0x4D))
  ) {
    const copy = Buffer.from(buffer);
    sanitizeTiffGps(copy, 0);
    return copy;
  }

  return buffer;
}
