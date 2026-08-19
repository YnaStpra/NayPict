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

// Convert storage key to requestable file URL.
function toMediaUrl(key: string, domain?: string | null) {
  if (!key || !key.trim()) {
    return '';
  }

  const encodedKey = key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const base = formatHttpUrl(domain);

  // Route via /media proxy if domain is empty, or contains .r2.dev, or contains r2.cloudflarestorage.com (S3 API endpoint)
  if (base && !base.includes('.r2.dev') && !base.includes('r2.cloudflarestorage.com')) {
    return `${base}/${encodedKey}`;
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

export { formatHttpUrl, toMediaUrl, removePhotoIdFromUrl, setPhotoIdInUrl };
