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
  luma: Float32Array; // 16x16 grayscale luminance (256 floats)
  dHash0: number; // 32-bit lower gradient hash
  dHash1: number; // 32-bit upper gradient hash
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
 * Highly optimized O(1) Hamming weight (population count) for 32-bit unsigned integers.
 */
export function popcount32(n: number): number {
  let v = n >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Pre-computes a compact visual fingerprint from a stored ThumbHash.
 * Incorporates color sampling, grayscale luminance, and directional gradient hash (dHash).
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
    const luma = new Float32Array(sampleGrid * sampleGrid);
    let ptr = 0;

    for (let sy = 0; sy < sampleGrid; sy++) {
      const y = Math.floor((sy / sampleGrid) * rendered.h);
      for (let sx = 0; sx < sampleGrid; sx++) {
        const x = Math.floor((sx / sampleGrid) * rendered.w);
        const idx = (y * rendered.w + x) * 4;
        const r = rendered.rgba[idx];
        const g = rendered.rgba[idx + 1];
        const b = rendered.rgba[idx + 2];

        grid[ptr++] = r;
        grid[ptr++] = g;
        grid[ptr++] = b;

        // ITU-R BT.601 perceptual luminance formula
        luma[sy * sampleGrid + sx] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    // 8x8 gradient difference hash (dHash) from luminance (split into two 32-bit unsigned ints)
    let dHash0 = 0;
    let dHash1 = 0;
    let bitIdx = 0;

    for (let y = 0; y < 8; y++) {
      const yOffset = y * 2;
      for (let x = 0; x < 8; x++) {
        const xOffset = x * 2;
        const left = luma[yOffset * sampleGrid + xOffset];
        const right = luma[yOffset * sampleGrid + xOffset + 1];

        if (left > right) {
          if (bitIdx < 32) {
            dHash0 |= 1 << bitIdx;
          } else {
            dHash1 |= 1 << (bitIdx - 32);
          }
        }
        bitIdx++;
      }
    }

    return {
      photoId,
      thumbHashHex,
      aspectRatio,
      avgColor: { r: avg.r, g: avg.g, b: avg.b },
      grid,
      luma,
      dHash0: dHash0 >>> 0,
      dHash1: dHash1 >>> 0,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Calculates visual similarity score (0.0 to 1.0) between two pre-computed visual signatures.
 * Employs multi-layer verification:
 * 1. Strict aspect ratio tolerance (<= 3.5%)
 * 2. Average color distance (<= 0.14)
 * 3. Gradient difference hash (Hamming distance <= 4 of 64 bits)
 * 4. Normalized pixel L1 distance (similarity >= 0.965)
 */
export function calculateVisualSimilarity(
  sigA: VisualSignature,
  sigB: VisualSignature,
  options?: { maxArDiff?: number; maxColorDist?: number; minPixelSim?: number; maxHammingDist?: number }
): number {
  if (sigA.thumbHashHex === sigB.thumbHashHex) {
    return 1.0;
  }

  const maxArDiff = options?.maxArDiff ?? 0.035; // 3.5% aspect ratio tolerance
  const maxColorDist = options?.maxColorDist ?? 0.14;
  const minPixelSim = options?.minPixelSim ?? 0.965;
  const maxHammingDist = options?.maxHammingDist ?? 4;

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
  const pixelSim = 1 - totalDiff / maxDiff;
  if (pixelSim < minPixelSim) return 0;

  // 4. dHash Hamming Distance (Gradient verification)
  const diff0 = (sigA.dHash0 ^ sigB.dHash0) >>> 0;
  const diff1 = (sigA.dHash1 ^ sigB.dHash1) >>> 0;
  const hammingDist = popcount32(diff0) + popcount32(diff1);
  if (hammingDist > maxHammingDist) return 0;

  const dHashSim = 1 - hammingDist / 64;

  // Weighted combined score: 60% pixel correlation + 40% structural gradient match
  return pixelSim * 0.6 + dHashSim * 0.4;
}

/**
 * Quick helper to evaluate if two thumbhashes represent a duplicate media item.
 */
export function areThumbHashesDuplicate(
  hashA?: string | null,
  hashB?: string | null,
  threshold = 0.965
): boolean {
  if (!hashA || !hashB) return false;
  if (hashA === hashB) return true;

  const sigA = createVisualSignature('a', hashA);
  const sigB = createVisualSignature('b', hashB);
  if (!sigA || !sigB) return false;

  return calculateVisualSimilarity(sigA, sigB) >= threshold;
}
