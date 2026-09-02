// NayPict Progressive Web App (PWA) Service Worker with intelligent offline caching.

const CACHE_NAME = 'naypict-static-v1';
const MEDIA_CACHE_NAME = 'naypict-media-v1';

const PRECACHE_ASSETS = [
  '/',
  '/photos',
  '/logo.webp',
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

// Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== MEDIA_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Cache-First for media, Stale-While-Revalidate for static assets, Network-First for HTML
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Never cache API calls, SSE streaming, or non-same-origin API endpoints
  if (url.pathname.startsWith('/api') || url.pathname.includes('/sse')) {
    return;
  }

  // 1. Photo Media & Derivative Images: Stale-While-Revalidate with dedicated media cache
  if (url.pathname.startsWith('/media/') || request.destination === 'image') {
    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          // Fetch fresh version in background if online
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse);
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // Otherwise fetch from network and cache
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
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

  // 2. Navigation / Page Requests: Network-First with offline fallback
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

  // 3. Static Assets (CSS, JS, Fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse);
            });
          }
          return networkResponse.clone();
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
