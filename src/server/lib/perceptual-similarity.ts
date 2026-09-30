import {
  thumbHashToRGBA,
  thumbHashToAverageRGBA,
  thumbHashToApproximateAspectRatio,
} from 'thumbhash';

export interface VisualSignature {
  photoId: string;
  thumbHashHex: string;
  aspectRatio: number;
  avgColor: { r: number; g: number; b: number };
  grid: Uint8Array; // 16x16x3 normalized RGB vector (768 bytes)
}

/**
 * Convert a hexadecimal string to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const len = cleanHex.length;
  const bytes = new Uint8Array(Math.floor(len / 2));
  for (let i = 0; i < len; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Pre-computes a compact visual fingerprint from a stored ThumbHash.
 * Decoding takes < 0.05ms per item and creates a 768-byte normalized descriptor.
 */
export function createVisualSignature(photoId: string, thumbHashHex?: string | null): VisualSignature | null {
  if (!thumbHashHex || thumbHashHex.length < 10) return null;

  try {
    const bytes = hexToBytes(thumbHashHex);
    if (!bytes.length) return null;

    const aspectRatio = thumbHashToApproximateAspectRatio(bytes);
    const avg = thumbHashToAverageRGBA(bytes);
    const rendered = thumbHashToRGBA(bytes);

    if (!rendered || !rendered.w || !rendered.h || !rendered.rgba) return null;

    const sampleGrid = 16;
    const grid = new Uint8Array(sampleGrid * sampleGrid * 3);
    let ptr = 0;

    for (let sy = 0; sy < sampleGrid; sy++) {
      const y = Math.floor((sy / sampleGrid) * rendered.h);
      for (let sx = 0; sx < sampleGrid; sx++) {
        const x = Math.floor((sx / sampleGrid) * rendered.w);
        const idx = (y * rendered.w + x) * 4;
        grid[ptr++] = rendered.rgba[idx];
        grid[ptr++] = rendered.rgba[idx + 1];
        grid[ptr++] = rendered.rgba[idx + 2];
      }
    }

    return {
      photoId,
      thumbHashHex,
      aspectRatio,
      avgColor: { r: avg.r, g: avg.g, b: avg.b },
      grid,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Calculates visual similarity score (0.0 to 1.0) between two pre-computed visual signatures.
 * Fast execution: ~0.005ms per pair comparison.
 */
export function calculateVisualSimilarity(
  sigA: VisualSignature,
  sigB: VisualSignature,
  options?: { maxArDiff?: number; maxColorDist?: number }
): number {
  if (sigA.thumbHashHex === sigB.thumbHashHex) {
    return 1.0;
  }

  const maxArDiff = options?.maxArDiff ?? 0.08; // 8% aspect ratio tolerance
  const maxColorDist = options?.maxColorDist ?? 0.22;

  // 1. Aspect Ratio check
  const maxAr = Math.max(sigA.aspectRatio, sigB.aspectRatio);
  if (maxAr > 0) {
    const arDiff = Math.abs(sigA.aspectRatio - sigB.aspectRatio) / maxAr;
    if (arDiff > maxArDiff) return 0;
  }

  // 2. Average Color Euclidean distance
  const colorDist = Math.sqrt(
    Math.pow(sigA.avgColor.r - sigB.avgColor.r, 2) +
    Math.pow(sigA.avgColor.g - sigB.avgColor.g, 2) +
    Math.pow(sigA.avgColor.b - sigB.avgColor.b, 2)
  );
  if (colorDist > maxColorDist) return 0;

  // 3. Normalized 16x16 pixel difference
  const gridA = sigA.grid;
  const gridB = sigB.grid;
  const len = gridA.length;
  let totalDiff = 0;

  for (let i = 0; i < len; i++) {
    totalDiff += Math.abs(gridA[i] - gridB[i]);
  }

  const maxDiff = len * 255;
  const similarity = 1 - (totalDiff / maxDiff);
  return similarity;
}

/**
 * Quick helper to evaluate if two thumbhashes represent a duplicate media item.
 */
export function areThumbHashesDuplicate(
  hashA?: string | null,
  hashB?: string | null,
  threshold = 0.93
): boolean {
  if (!hashA || !hashB) return false;
  if (hashA === hashB) return true;

  const sigA = createVisualSignature('a', hashA);
  const sigB = createVisualSignature('b', hashB);
  if (!sigA || !sigB) return false;

  return calculateVisualSimilarity(sigA, sigB) >= threshold;
}
