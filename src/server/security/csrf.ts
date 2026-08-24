import type { Context, Next } from 'hono';
import BizError from '@/server/error/biz-error';

// This module provides strict Cross-Site Request Forgery (CSRF) protection for state-changing API endpoints.

// List of state-changing HTTP methods subject to CSRF verification.
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Sensitive administrative endpoints that require additional strict Anti-CSRF verification.
const SENSITIVE_MUTATION_PATHS = [
  '/user/set',
  '/user/delete',
  '/user/add',
  '/user/toggleStatus',
  '/storage/add',
  '/storage/set',
  '/storage/delete',
  '/photo/clear',
  '/photo/delete',
  '/album/delete',
  '/album/trash',
  '/totp/enable',
  '/totp/disable',
  '/totp/setup',
  '/setting/set',
];

// Extract hostname without port from a URL string or host header.
function getHostname(urlOrHost: string): string {
  try {
    if (urlOrHost.includes('://')) {
      return new URL(urlOrHost).hostname.toLowerCase();
    }
    return urlOrHost.split(':')[0].trim().toLowerCase();
  } catch {
    return '';
  }
}

// Validates request Origin / Referer against the current server host and allowed origins.
function isOriginAllowed(originOrReferer: string, expectedHost: string): boolean {
  if (!originOrReferer) return false;

  const sourceHost = getHostname(originOrReferer);
  const targetHost = getHostname(expectedHost);

  if (!sourceHost || !targetHost) return false;

  // 1. Exact hostname match
  if (sourceHost === targetHost) return true;

  // 2. Allow local loopback addresses (localhost / 127.0.0.1)
  const isLocalSource = sourceHost === 'localhost' || sourceHost === '127.0.0.1' || sourceHost === '::1';
  const isLocalTarget = targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost === '::1';
  if (isLocalSource && isLocalTarget) return true;

  // 3. Optional configured allowed origins (APP_URL or NEXT_PUBLIC_APP_URL)
  if (process.env.APP_URL) {
    const appHost = getHostname(process.env.APP_URL);
    if (appHost && sourceHost === appHost) return true;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const pubHost = getHostname(process.env.NEXT_PUBLIC_APP_URL);
    if (pubHost && sourceHost === pubHost) return true;
  }

  return false;
}

// CSRF Protection Middleware for Hono.
// Verifies Origin / Referer headers on state-changing requests and enforces custom headers on sensitive mutations.
export async function csrfProtection(c: Context, next: Next) {
  const method = c.req.method.toUpperCase();

  // Safe idempotent methods (GET, HEAD, OPTIONS) do not require CSRF validation
  if (!MUTATION_METHODS.has(method)) {
    return next();
  }

  const path = c.req.path.replace(/^\/api/, '');

  // Exempt browser telemetry / CSP reporting endpoints from CSRF
  if (path === '/csp-report') {
    return next();
  }

  const origin = c.req.header('origin') || '';
  const referer = c.req.header('referer') || '';
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || '';

  // Determine whether this request is targeting a high-risk sensitive mutation
  const isSensitive = SENSITIVE_MUTATION_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // 1. If Origin header is provided (sent automatically on cross-origin and fetch requests)
  if (origin) {
    if (origin === 'null' || !isOriginAllowed(origin, host)) {
      console.warn(`[CSRF BLOCKED] Origin mismatch on ${method} ${path}: Origin="${origin}", Host="${host}"`);
      throw new BizError('csrf.originMismatch', 403);
    }
  } else if (referer) {
    // 2. If Origin is missing, verify Referer header
    if (!isOriginAllowed(referer, host)) {
      console.warn(`[CSRF BLOCKED] Referer mismatch on ${method} ${path}: Referer="${referer}", Host="${host}"`);
      throw new BizError('csrf.originMismatch', 403);
    }
  } else if (isSensitive) {
    // 3. For high-risk sensitive operations, Origin or Referer MUST be present
    console.warn(`[CSRF BLOCKED] Sensitive mutation ${method} ${path} missing Origin and Referer`);
    throw new BizError('csrf.originRequired', 403);
  }

  // 4. Double-Defense for Sensitive Mutations: Require custom header or JSON content-type
  if (isSensitive) {
    const requestedWith = c.req.header('x-requested-with');
    const contentType = c.req.header('content-type') || '';
    const isJson = contentType.includes('application/json');
    const isCustomHeader = Boolean(requestedWith) || isJson;

    if (!isCustomHeader) {
      console.warn(`[CSRF BLOCKED] Sensitive mutation ${method} ${path} missing custom request header`);
      throw new BizError('csrf.invalidHeader', 403);
    }
  }

  return next();
}
