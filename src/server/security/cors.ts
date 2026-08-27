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

// Build a deduplicated allowlist that remains empty when no valid app URL is configured.
function getAllowedOrigins(): string[] {
  const origins = [
    normalizeOrigin(process.env.APP_URL),
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
  ].filter((origin): origin is string => Boolean(origin));

  return [...new Set(origins)];
}

// Return the request origin only when it exactly matches the current configured allowlist.
function resolveAllowedOrigin(origin: string): string | null {
  return getAllowedOrigins().includes(origin) ? origin : null;
}

// Restrict API CORS access to trusted application origins and supported request shapes.
const apiCors = cors({
  origin: resolveAllowedOrigin,
  allowMethods: ['GET', 'HEAD', 'POST'],
  allowHeaders: ALLOW_HEADERS,
});

// Restrict proxied media CORS access to read-only requests from trusted application origins.
const mediaCors = cors({
  origin: resolveAllowedOrigin,
  allowMethods: ['GET', 'HEAD'],
  allowHeaders: ALLOW_HEADERS,
});

export { apiCors, mediaCors };
