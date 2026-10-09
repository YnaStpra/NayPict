// NayPict Progressive Web App (PWA) Service Worker with intelligent offline caching.
// Provides Google Photos / iCloud-style 0ms media caching, background revalidation, and offline resilience.

const CACHE_NAME = 'naypict-static-v3';
const MEDIA_CACHE_NAME = 'naypict-media-v4';
const API_CACHE_NAME = 'naypict-api-v2';

const PRECACHE_ASSETS = [
  '/',
  '/photos',
  '/albums',
  '/naypict-icon.svg',
  '/favicon.ico',
  '/manifest.webmanifest',
];

// Install Event: Pre-cache critical application shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[PWA-SW] Pre-caching warning:', err);
      });
    })
  );
  self.skipWaiting();
});

const MAX_MEDIA_CACHE_ITEMS = 1000;

let trimTimer = null;
function scheduleTrimMediaCache(cacheName, maxItems) {
  if (trimTimer) clearTimeout(trimTimer);
  trimTimer = setTimeout(() => {
    trimMediaCache(cacheName, maxItems);
  }, 4000);
}

let mediaCachePromise = null;
function getMediaCache() {
  if (!mediaCachePromise) {
    mediaCachePromise = caches.open(MEDIA_CACHE_NAME);
  }
  return mediaCachePromise;
}

/**
 * Prune media cache to a maximum number of items using FIFO/LRU eviction.
 * Prevents mobile device storage from being exhausted over time.
 */
async function trimMediaCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const toDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(toDelete.map((key) => cache.delete(key)));
    }
  } catch (err) {
    // Ignore cache trimming errors in background
  }
}

// Activate Event: Clean up outdated caches and enforce media storage limit
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== MEDIA_CACHE_NAME && key !== API_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await trimMediaCache(MEDIA_CACHE_NAME, MAX_MEDIA_CACHE_ITEMS);
    })
  );
  self.clients.claim();
});

// Helper to determine if an image response is safely cacheable
function isCacheableMedia(res) {
  if (!res) return false;
  if (res.status !== 200 && res.type !== 'opaque') return false;
  if (res.type === 'opaque') return true;
  const cc = (res.headers.get('cache-control') || '').toLowerCase();
  return !cc.includes('private') && !cc.includes('no-store');
}

/**
 * Helper to fetch with exponential backoff retry (1s, 2s, 4s).
 * Prevents broken images and transient network request failures on weak or fluctuating mobile connections.
 */
async function fetchWithExponentialRetry(request, retries = 3, delays = [1000, 2000, 4000]) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const req = (attempt > 0 && request instanceof Request) ? request.clone() : request;
      const response = await fetch(req);
      if (!response.ok && [502, 503, 504].includes(response.status) && attempt < retries) {
        const delay = delays[attempt] || 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = delays[attempt] || 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Fetch Event: Cache-First for media & derivatives, Stale-While-Revalidate for read-only catalog APIs
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Invalidate read-only API cache on mutations (POST, PUT, DELETE, PATCH)
  if (request.method !== 'GET') {
    if (url.pathname.startsWith('/api/')) {
      caches.delete(API_CACHE_NAME).catch(() => {});
    }
    return;
  }

  // Only handle HTTP/HTTPS protocols
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Never cache sensitive admin APIs, SSE streams, or auth endpoints
  if (
    url.pathname.startsWith('/api/admin') ||
    url.pathname.startsWith('/api/auth') ||
    url.pathname.startsWith('/api/session') ||
    url.pathname.startsWith('/api/insights/visitor') ||
    url.pathname.includes('/sse')
  ) {
    return;
  }

  // Allow video streaming and byte-range requests to stream directly at native line speed.
  // Service Worker response interception impairs HTTP 206 Partial Content byte ranges and causes buffering stalls.
  if (
    request.headers.has('range') ||
    request.destination === 'video' ||
    url.pathname.match(/\.(mp4|webm|mov|m4v|mkv)$/i)
  ) {
    return;
  }

  // Explicitly ignore external map tiles (Google Maps, OpenStreetMap, CARTO, ESRI ArcGIS)
  // Let the browser's native HTTP cache, subdomains, and CDN headers handle map tiles directly.
  const isExternalMapTile =
    url.hostname.includes('google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('arcgisonline.com');

  if (isExternalMapTile) {
    return;
  }

  // 1. Photo Media, Thumbnails & Derivative Images (CDN edge & local proxy):
  // True Cache-First for immutable thumbnails & previews: 0ms instant display without network lag
  const isMediaRequest =
    url.pathname.startsWith('/media/') ||
    (request.destination === 'image' && (url.origin === self.location.origin || url.hostname.includes('workers.dev') || url.hostname.includes('r2.dev'))) ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('r2.dev') ||
    url.pathname.includes('/thumbnails/') ||
    url.pathname.includes('/previews/');

  if (isMediaRequest) {
    const isDerivative =
      url.pathname.includes('/thumbnails/') ||
      url.pathname.includes('/previews/') ||
      url.pathname.includes('thumbnails%2F') ||
      url.pathname.includes('previews%2F') ||
      url.hostname.includes('workers.dev');

    event.respondWith(
      getMediaCache().then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          // True Cache-First for immutable derivatives: return instantly in 0ms
          if (isDerivative) {
            return cachedResponse;
          }

          // Fetch fresh version in background with exponential retry for mutable/dynamic images if online
          fetchWithExponentialRetry(request, 2, [1000, 2000])
            .then((networkResponse) => {
              if (isCacheableMedia(networkResponse)) {
                const responseToCache = networkResponse.clone();
                cache.put(request, responseToCache).then(() => {
                  scheduleTrimMediaCache(MEDIA_CACHE_NAME, MAX_MEDIA_CACHE_ITEMS);
                });
              } else if (networkResponse && networkResponse.status === 200) {
                cache.delete(request);
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // Cache miss: fetch from network with exponential backoff (1s, 2s, 4s) and store in CacheStorage
        return fetchWithExponentialRetry(request, 3, [1000, 2000, 4000])
          .then((networkResponse) => {
            if (isCacheableMedia(networkResponse)) {
              const responseToCache = networkResponse.clone();
              cache.put(request, responseToCache).then(() => {
                scheduleTrimMediaCache(MEDIA_CACHE_NAME, MAX_MEDIA_CACHE_ITEMS);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            return cachedResponse || new Response('Image unavailable offline', { status: 503 });
          });
      })
    );
    return;
  }

  // 2. Read-Only Catalog & Album Lists (/api/photo/list, /api/album/list):
  // Stale-While-Revalidate delivers instant 0ms cached list, then updates in background with retry
  if (url.pathname === '/api/photo/list' || url.pathname === '/api/album/list') {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetchWithExponentialRetry(request, 3, [1000, 2000, 4000])
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              cache.put(request, responseToCache);
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Navigation / Page Requests: Network-First with quick retry then offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetchWithExponentialRetry(request, 2, [500, 1000]).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedPage = await cache.match(request);
        return cachedPage || (await cache.match('/photos')) || (await cache.match('/'));
      })
    );
    return;
  }

  // 4. Static Assets (CSS, JS, Fonts): Stale-While-Revalidate with retry
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetchWithExponentialRetry(request, 2, [1000, 2000])
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Client Communication Channel (Prefetching & Invalidation)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Speculative prefetching of next photos triggered by UI during idle time
  if (event.data.type === 'PREFETCH_MEDIA' && Array.isArray(event.data.urls)) {
    const urls = event.data.urls;
    getMediaCache().then((cache) => {
      urls.forEach(async (mediaUrl) => {
        try {
          const match = await cache.match(mediaUrl);
          if (!match) {
            const res = await fetchWithExponentialRetry(mediaUrl, 2, [1000, 2000]);
            if (isCacheableMedia(res)) {
              await cache.put(mediaUrl, res);
            }
          }
        } catch {
          // Ignore prefetch failures in background
        }
      });
    });
  }

  // Invalidate API cache when client performs mutation or sync
  if (event.data.type === 'INVALIDATE_API_CACHE') {
    caches.delete(API_CACHE_NAME).catch(() => {});
  }
});

// Background Sync Event: Automatically synchronize catalog data when device regains connectivity
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-catalog' || event.tag === 'sync-media-cache') {
    event.waitUntil(
      (async () => {
        try {
          const apiCache = await caches.open(API_CACHE_NAME);
          const syncUrls = ['/api/photo/list', '/api/album/list'];
          await Promise.allSettled(
            syncUrls.map(async (url) => {
              try {
                const res = await fetchWithExponentialRetry(url, 2, [1000, 2000]);
                if (res && res.status === 200) {
                  await apiCache.put(url, res);
                }
              } catch {
                // Ignore transient background sync failure
              }
            })
          );
        } catch {
          // Ignore background sync errors
        }
      })()
    );
  }
});

