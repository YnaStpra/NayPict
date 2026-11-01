// This module provides URL formatting and parsing helper methods.

// Format HTTP URL, returning empty string when not configured, adding https:// protocol by default if missing.
function formatHttpUrl(input?: string | null) {
  const value = input?.trim();

  if (!value) {
    return '';
  }

  const httpUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  return httpUrl.replace(/\/+$/, '');
}

const MEDIA_GATEWAY_DEFAULT = process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL || process.env.R2_MEDIA_GATEWAY_URL || '';

// Safely decode percent-encoded string repeatedly until normalized to prevent double/triple-encoding bugs.
function safeDecodeKey(key: string): string {
  let current = key;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

// Convert storage key to requestable file URL.
function toMediaUrl(key: string, domain?: string | null) {
  if (!key || !key.trim()) {
    return '';
  }

  const cleanKey = safeDecodeKey(key.trim());
  const encodedKey = cleanKey.split('/').map((segment) => encodeURIComponent(segment)).join('/');

  const isDerivative = cleanKey.startsWith('previews/') || cleanKey.startsWith('thumbnails/');
  const isVideo = Boolean(cleanKey.match(/\.(mp4|webm|mov|m4v|mkv)$/i));

  // If public media gateway is configured, deliver cacheable derivatives & videos directly from edge CDN (eliminates 307 redirect RTT)
  const gatewayBase = formatHttpUrl(process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL || process.env.R2_MEDIA_GATEWAY_URL || MEDIA_GATEWAY_DEFAULT);
  if ((isDerivative || isVideo) && gatewayBase && !gatewayBase.includes('r2.cloudflarestorage.com')) {
    return `${gatewayBase}/${encodedKey}`;
  }

  // If public custom domain is configured on storage (e.g. *.r2.dev or custom CDN), deliver directly via global CDN edge
  const directBase = formatHttpUrl(domain);
  if (directBase && !directBase.includes('r2.cloudflarestorage.com')) {
    return `${directBase}/${encodedKey}`;
  }

  return `/media/${encodedKey}`;
}

// Remove photoId query parameter from current browser address bar without page reload.
function removePhotoIdFromUrl() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('photoId')) {
      url.searchParams.delete('photoId');
      const cleanUrl = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
      window.history.replaceState({ ...window.history.state, photoId: undefined }, '', cleanUrl);
    }
  } catch {
    // Ignore URL parsing errors
  }
}

// Set photoId query parameter in current browser address bar without adding extra history stack.
function setPhotoIdInUrl(photoId?: string | null) {
  if (typeof window === 'undefined' || !photoId) return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('photoId') !== photoId) {
      url.searchParams.set('photoId', photoId);
      window.history.replaceState({ ...window.history.state, photoId }, '', url.toString());
    }
  } catch {
    // Ignore URL parsing errors
  }
}

// Safely extract media key and convert any URL (CDN or relative) into optimized file URL.
// When forceDirect is true, bypasses external gateway domains and forces the origin /media server route.
function toProxyMediaUrl(urlOrKey?: string | null, forceDirect = false): string {
  if (!urlOrKey || !urlOrKey.trim()) {
    return '';
  }

  let cleanKey = urlOrKey.trim();
  try {
    if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
      const parsed = new URL(cleanKey);
      cleanKey = parsed.pathname;
    }
  } catch {
    // Keep raw string if parsing fails
  }

  cleanKey = cleanKey.replace(/^\/+media\/+/, '').replace(/^\/+/, '');
  cleanKey = safeDecodeKey(cleanKey);
  const encodedKey = cleanKey.split('/').map((segment) => encodeURIComponent(segment)).join('/');

  if (forceDirect) {
    return `/media/${encodedKey}?direct=1`;
  }

  const isDerivative = cleanKey.startsWith('previews/') || cleanKey.startsWith('thumbnails/');
  const isVideo = Boolean(cleanKey.match(/\.(mp4|webm|mov|m4v|mkv)$/i));
  if (isDerivative || isVideo) {
    const gatewayBase = formatHttpUrl(process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL || process.env.R2_MEDIA_GATEWAY_URL || MEDIA_GATEWAY_DEFAULT);
    if (gatewayBase) {
      return `${gatewayBase}/${encodedKey}`;
    }
  }

  return `/media/${encodedKey}`;
}

export { formatHttpUrl, toMediaUrl, toProxyMediaUrl, removePhotoIdFromUrl, setPhotoIdInUrl };
