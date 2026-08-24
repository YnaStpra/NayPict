import { thumbHashToDataURL } from "thumbhash"

// This module provides high-performance thumbHash decoding and memoized data-URL conversion.

// In-memory LRU cache to prevent repeated CPU-heavy hex parsing and canvas drawing during render loops
const thumbHashCache = new Map<string, string>();
// Dynamic memory bound: 600 entries on mobile to prevent RAM pressure, 1500 on desktop
function getMaxCacheLimit(): number {
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    return 600;
  }
  return 1500;
}

// Converts thumbHash hex string to Uint8Array.
function decodeThumbHash(thumbHash: string) {
  return Uint8Array.from(thumbHash.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [])
}

// Converts thumbHash hex to blurred background data-URL with dynamic LRU memoization.
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
    const maxLimit = getMaxCacheLimit();
    if (thumbHashCache.size >= maxLimit) {
      const oldestKey = thumbHashCache.keys().next().value;
      if (oldestKey) thumbHashCache.delete(oldestKey);
    }
    thumbHashCache.set(thumbHash, dataUrl);
    return dataUrl;
  } catch {
    return undefined;
  }
}

// Explicitly evict thumbHash memory cache to free RAM during memory warnings
function clearThumbHashCache(): void {
  thumbHashCache.clear();
}

export { decodeThumbHash, getThumbHashUrl, clearThumbHashCache }

