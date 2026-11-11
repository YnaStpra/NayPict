// Short-lived in-memory cache for publicly accessible media derivative metadata.
// Restricted media (deleted, archived, original, or orphan ALBUM_ONLY) must NEVER be stored here.

const MEDIA_FILE_CACHE_TTL_MS = 60_000;
const MEDIA_FILE_CACHE_MAX_ENTRIES = 2000;

interface MediaFileCacheEntry<T> {
  data: T;
  exp: number;
}

const mediaFileCache = new Map<string, MediaFileCacheEntry<unknown>>();

export function getCachedMediaFile<T = unknown>(key: string): T | undefined {
  const entry = mediaFileCache.get(key);
  if (!entry) return undefined;
  if (entry.exp <= Date.now()) {
    mediaFileCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCachedMediaFile<T = unknown>(key: string, data: T): void {
  if (mediaFileCache.size >= MEDIA_FILE_CACHE_MAX_ENTRIES) {
    const oldestKey = mediaFileCache.keys().next().value;
    if (oldestKey) mediaFileCache.delete(oldestKey);
  }
  mediaFileCache.set(key, {
    data,
    exp: Date.now() + MEDIA_FILE_CACHE_TTL_MS,
  });
}

export function invalidateMediaFileCache(): void {
  mediaFileCache.clear();
}

