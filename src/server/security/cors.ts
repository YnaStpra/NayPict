import { cors } from 'hono/cors';

// This module provides strict, shared CORS policies for API and proxied media responses.

const ALLOW_HEADERS = ['Content-Type', 'X-Requested-With'];

// Normalize a configured HTTP(S) URL to the exact origin accepted by browsers.
function normalizeOrigin(value?: string): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

// Build a deduplicated allowlist that includes configured and canonical production/preview origins.
function getAllowedOrigins(): string[] {
  const origins = [
    normalizeOrigin(process.env.APP_URL),
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
    'https://naypict.my.id',
    'https://www.naypict.my.id',
  ].filter((origin): origin is string => Boolean(origin));

  return [...new Set(origins)];
}

// Return the request origin only when it matches the allowlist or verified environment.
function resolveAllowedOrigin(origin: string): string | null {
  if (!origin) return null;
  const list = getAllowedOrigins();
  if (list.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === 'naypict.my.id' || host.endsWith('.naypict.my.id') || host === 'localhost' || host === '127.0.0.1') {
      return origin;
    }
  } catch {}
  return null;
}

// Proxied media reads are public assets; reflect allowed request origin or default to permissive wildcard.
function resolveMediaOrigin(origin: string): string {
  if (!origin) return '*';
  const resolved = resolveAllowedOrigin(origin);
  return resolved || '*';
}

// Restrict API CORS access to trusted application origins and supported request shapes.
const apiCors = cors({
  origin: resolveAllowedOrigin,
  allowMethods: ['GET', 'HEAD', 'POST'],
  allowHeaders: ALLOW_HEADERS,
});

// Proxied media CORS allows public reading from valid origins with wildcard fallback.
const mediaCors = cors({
  origin: resolveMediaOrigin,
  allowMethods: ['GET', 'HEAD'],
  allowHeaders: ALLOW_HEADERS,
});

export { apiCors, mediaCors };
