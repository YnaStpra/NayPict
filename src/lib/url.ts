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

const MEDIA_GATEWAY_DEFAULT = 'naypict-media-gateway.naypict.workers.dev';

// Convert storage key to requestable file URL.
function toMediaUrl(key: string, domain?: string | null) {
  if (!key || !key.trim()) {
    return '';
  }

  const encodedKey = key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const base = formatHttpUrl(domain || process.env.R2_MEDIA_GATEWAY_URL || MEDIA_GATEWAY_DEFAULT);

  // If public CDN domain is configured (e.g. *.r2.dev or custom media domain), deliver directly via global CDN edge
  // Only route via /media server proxy if domain is empty or points to private S3 API endpoint (r2.cloudflarestorage.com)
  if (base && !base.includes('r2.cloudflarestorage.com')) {
    return `${base}/${encodedKey}`;
  }

  return `${formatHttpUrl(MEDIA_GATEWAY_DEFAULT)}/${encodedKey}`;
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
// Videos and derivatives always route to Cloudflare Worker Media Gateway to preserve Vercel bandwidth and execution time.
function toProxyMediaUrl(urlOrKey?: string | null): string {
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
  const encodedKey = cleanKey.split('/').map((segment) => encodeURIComponent(segment)).join('/');

  const isDerivative = cleanKey.startsWith('previews/') || cleanKey.startsWith('thumbnails/');
  if (isDerivative) {
    const gatewayBase = formatHttpUrl(process.env.R2_MEDIA_GATEWAY_URL || MEDIA_GATEWAY_DEFAULT);
    return `${gatewayBase}/${encodedKey}`;
  }

  return `/media/${encodedKey}`;
}

export { formatHttpUrl, toMediaUrl, toProxyMediaUrl, removePhotoIdFromUrl, setPhotoIdInUrl };
