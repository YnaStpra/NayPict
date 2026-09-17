# PWA Service Worker & Client Cache Isolation — NayPict Phase 3

This document details the assessment of Progressive Web App (PWA) Service Worker caching rules, client-side storage isolation, and the remediation of finding `SEC-PHASE3-01`.

---

## 1. PWA Service Worker Architecture

NayPict provides offline gallery viewing capabilities via a modern Service Worker registered in [`public/sw.js`](file:///Users/yansaputra/Naypict/public/sw.js).

### Cache Storage Partitions:
1. `naypict-static-v1`: Stores immutable static application shell assets (`/`, `/photos`, `/naypict-icon.svg`, `/manifest.webmanifest`, CSS, JS, fonts).
2. `naypict-media-v1`: Stores media thumbnails and derivative previews for offline browsing, bounded to a maximum of 150 items via FIFO/LRU eviction (`trimMediaCache`).

---

## 2. API & Sensitive Endpoint Exclusion

A critical vulnerability in poorly configured Service Workers is caching authenticated JSON API responses in browser `CacheStorage`. If an application caches `/api/*` responses, sensitive data (such as user info, session lists, or admin settings) can persist indefinitely and be extracted by local attackers or unauthorized users on shared devices.

In [`public/sw.js:72-75`](file:///Users/yansaputra/Naypict/public/sw.js#L72-L75):
```javascript
// Never cache API calls, SSE streaming, or non-same-origin API endpoints
if (url.pathname.startsWith('/api') || url.pathname.includes('/sse')) {
  return;
}
```
All API interactions bypass the Service Worker completely and query the network directly under standard HTTPS transit.

---

## 3. Finding Resolution: SEC-PHASE3-01 (Private Media Cache Isolation)

### Vulnerability Identified:
When an authenticated user downloads a protected original photo at `/media/{key}`, the server returns:
```http
HTTP/1.1 200 OK
Cache-Control: no-cache, private
Content-Disposition: inline; filename*=UTF-8''photo.jpg
```
The Service Worker previously matched `url.pathname.startsWith('/media/')` and placed all `status === 200` responses into `MEDIA_CACHE_NAME` without inspecting `Cache-Control`. On a shared workstation, a subsequent unauthenticated visitor on the same browser profile could open Developer Tools or offline cache and retrieve the protected original photograph.

### Security Hardening Applied:
In [`public/sw.js:77-115`](file:///Users/yansaputra/Naypict/public/sw.js#L77-L115):
```javascript
const isCacheableMedia = (res) => {
  if (!res || res.status !== 200) return false;
  const cc = (res.headers.get('cache-control') || '').toLowerCase();
  return !cc.includes('private') && !cc.includes('no-store');
};
```
1. **Private Response Exclusion**: Responses containing `private` or `no-store` are never stored in `CacheStorage`.
2. **Stale Entry Invalidation**: If an entry already exists in the cache and a background revalidation returns a `private` response (e.g. after permissions were revoked), `cache.delete(request)` is executed immediately to purge the asset from offline storage.

### Result:
**RESOLVED & VERIFIED**. Protected original photographs are never persisted into client-side CacheStorage. Only public derivatives and thumbnails are cached offline.
