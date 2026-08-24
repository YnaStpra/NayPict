import { thumbHashToDataURL } from "thumbhash"

// This module provides high-performance thumbHash decoding and memoized data-URL conversion.

// In-memory LRU cache to prevent repeated CPU-heavy hex parsing and canvas drawing during render loops
const thumbHashCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1200;

// Converts thumbHash hex string to Uint8Array.
function decodeThumbHash(thumbHash: string) {
  return Uint8Array.from(thumbHash.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [])
}

// Converts thumbHash hex to blurred background data-URL with high-speed LRU memoization.
function getThumbHashUrl(thumbHash?: string | null): string | undefined {
  if (!thumbHash) {
    return undefined;
  }

  const cached = thumbHashCache.get(thumbHash);
  if (cached) {
    return cached;
  }

  try {
    const dataUrl = thumbHashToDataURL(decodeThumbHash(thumbHash));
    if (thumbHashCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = thumbHashCache.keys().next().value;
      if (oldestKey) thumbHashCache.delete(oldestKey);
    }
    thumbHashCache.set(thumbHash, dataUrl);
    return dataUrl;
  } catch {
    return undefined;
  }
}

export { decodeThumbHash, getThumbHashUrl }

