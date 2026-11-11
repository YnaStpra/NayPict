// NayPict Progressive Web App (PWA) Service Worker with intelligent offline caching.
// Provides Google Photos / iCloud-style 0ms media caching, background revalidation, and offline resilience.

const CACHE_NAME = 'naypict-static-v5';
const MEDIA_CACHE_NAME = 'naypict-media-v4';
const API_CACHE_NAME = 'naypict-api-v2';

const PRECACHE_ASSETS = [
  '/',
  '/photos',
  '/albums',
  '/naypict-icon.svg',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/naypict-icon-192x192.png',
  '/naypict-icon-512x512.png',
  '/worklets/smooth-corners.js',
  '/worklets/skeleton-shimmer.js',
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

  // Invalidate cached API and media payloads on catalog mutations or logout.
  // Harmless visitor tracking, reaction pings, comments, and session beacons must NEVER flush photo/album caches.
  if (request.method !== 'GET') {
    if (url.pathname.includes('/logout')) {
      caches.delete(API_CACHE_NAME).catch(() => {});
      caches.delete(MEDIA_CACHE_NAME).catch(() => {});
      return;
    }

    const isCatalogMutation =
      url.pathname.includes('/photo/add') ||
      url.pathname.includes('/photo/edit') ||
      url.pathname.includes('/photo/batchEdit') ||
      url.pathname.includes('/photo/delete') ||
      url.pathname.includes('/photo/recycle') ||
      url.pathname.includes('/photo/restore') ||
      url.pathname.includes('/photo/clear') ||
      url.pathname.includes('/photo/setVisibility') ||
      url.pathname.includes('/photo/syncDelete') ||
      url.pathname.includes('/album/add') ||
      url.pathname.includes('/album/edit') ||
      url.pathname.includes('/album/delete') ||
      url.pathname.includes('/album/addPhoto') ||
      url.pathname.includes('/album/removePhoto') ||
      url.pathname.includes('/album/sort');

    if (isCatalogMutation) {
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
        let cachedResponse = await cache.match(request);
        // Fallback matching for initial public catalog requests to provide instant 0ms first screen
        if (!cachedResponse && url.pathname === '/api/photo/list' && !url.searchParams.has('cursorPhotoId') && !url.searchParams.has('offset')) {
          cachedResponse = await cache.match('/api/photo/list');
        }

        const fetchPromise = fetchWithExponentialRetry(request, 3, [1000, 2000, 4000])
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cc = (networkResponse.headers.get('cache-control') || '').toLowerCase();
              const isPrivateOrNoStore = cc.includes('no-store') || cc.includes('private');
              if (!isPrivateOrNoStore) {
                const responseToCache = networkResponse.clone();
                cache.put(request, responseToCache);
                if (url.pathname === '/api/photo/list' && !url.searchParams.has('cursorPhotoId') && !url.searchParams.has('offset')) {
                  cache.put('/api/photo/list', responseToCache.clone());
                }
              }
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Offline • NayPict</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      padding: 0;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #141414;
      color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      max-width: 420px;
      padding: 32px 24px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      padding: 12px;
      border-radius: 16px;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    h1 { font-size: 20px; margin: 0 0 8px; font-weight: 600; }
    p { font-size: 14px; color: #a3a3a3; margin: 0 0 24px; line-height: 1.5; }
    button {
      background: #fafafa;
      color: #171717;
      border: none;
      padding: 10px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s, opacity 0.15s;
    }
    button:active { transform: scale(0.96); opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a9 9 0 01-2.828-6.364m0 0a9 9 0 012.828-6.364m2.828 2.828a5 5 0 000 7.072M3 3l18 18" />
      </svg>
    </div>
    <h1>You're Offline</h1>
    <p>NayPict couldn't reach the server. Check your connection or retry once you're back online.</p>
    <button onclick="window.location.reload()">Retry Connection</button>
  </div>
  <script>
    window.addEventListener('online', function() { window.location.reload(); });
  </script>
</body>
</html>`;

  // 3. Navigation / Page Requests: Network-First with quick retry then offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetchWithExponentialRetry(request, 2, [500, 1000]).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedPage = await cache.match(request);
        const shell = cachedPage || (await cache.match('/photos')) || (await cache.match('/'));
        if (shell) return shell;
        return new Response(OFFLINE_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
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

