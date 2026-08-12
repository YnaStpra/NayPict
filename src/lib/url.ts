// This module provides URL Process related tools and methods。

// format HTTP URL，Returns an empty string when not configured，If no protocol is provided, it will be supplemented by default. https。
function formatHttpUrl(input?: string | null) {
  const value = input?.trim();

  if (!value) {
    return '';
  }

  const httpUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  return httpUrl.replace(/\/+$/, '');
}

// store key Convert to a requestable file address, Path fragments are encoded piece by piece to avoid # Truncate special characters URL.
function toMediaUrl(key: string, domain?: string | null) {
  const encodedKey = key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const base = formatHttpUrl(domain);

  // If domain is an r2.dev domain (wildcard-blocked by Indonesian ISP DNS filtering), route via /media proxy for 100% reliable delivery
  if (base && !base.includes('.r2.dev')) {
    return `${base}/${encodedKey}`;
  }

  return `/media/${encodedKey}`;
}

export { formatHttpUrl, toMediaUrl };
