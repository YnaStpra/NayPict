// NayPict Progressive Web App (PWA) Service Worker with intelligent offline caching.
// Provides Google Photos / iCloud-style 0ms media caching, background revalidation, and offline resilience.

const CACHE_NAME = 'naypict-static-v2';
const MEDIA_CACHE_NAME = 'naypict-media-v2';
const API_CACHE_NAME = 'naypict-api-v1';

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

  // 1. Photo Media, Thumbnails & Derivative Images (CDN edge & local proxy):
  // True Cache-First for immutable thumbnails & previews: 0ms instant display without network lag
  const isMediaRequest =
    url.pathname.startsWith('/media/') ||
    request.destination === 'image' ||
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

          // Fetch fresh version in background for mutable/dynamic images if online
          fetch(request)
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

        // Cache miss: fetch from network and store in CacheStorage
        return fetch(request)
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
  // Stale-While-Revalidate delivers instant 0ms cached list, then updates in background
  if (url.pathname === '/api/photo/list' || url.pathname === '/api/album/list') {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request)
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

  // 3. Navigation / Page Requests: Network-First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedPage = await cache.match(request);
        return cachedPage || (await cache.match('/photos')) || (await cache.match('/'));
      })
    );
    return;
  }

  // 4. Static Assets (CSS, JS, Fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
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
            const res = await fetch(mediaUrl, { priority: 'low' });
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
