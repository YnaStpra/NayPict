// Pixtale Service Worker - Cache-First for media & Stale-While-Revalidate for gallery JSON APIs

const CACHE_NAME = 'pixtale-v1';
const STATIC_ASSETS = [
  '/',
  '/logo.png',
  '/favicon.ico',
];

// Install: Pre-cache static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Continue if some static assets fail to pre-cache
      });
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Strategy dispatcher
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Exclude non-GET requests, admin routes, and auth mutations
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/login') ||
    url.pathname.startsWith('/api/user') ||
    url.pathname.startsWith('/api/setting') ||
    url.pathname.startsWith('/admin')
  ) {
    return;
  }

  // 1. Media Assets & Images: Cache-First strategy
  if (
    url.pathname.startsWith('/media/') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|avif|svg|woff2|ico)$/i)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clonedResponse = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. Public API Data: Stale-While-Revalidate strategy
  if (
    url.pathname.startsWith('/api/photo/') ||
    url.pathname.startsWith('/api/photos/') ||
    url.pathname.startsWith('/api/album/')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }
});
