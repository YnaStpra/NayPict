import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createId } from '@/server/lib/id';
import crypto from 'node:crypto';

// This module provides cryptographically signed visitor cookies (HMAC-SHA256) to prevent visitor ID tampering and metric manipulation.

export const VISITOR_COOKIE_NAME = 'naypict_vid';
export const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function getSigningSecret(): string {
  return process.env.JWT_SECRET?.trim() || 'naypict_visitor_cookie_fallback_secret_32b!';
}

// Generate an HMAC-SHA256 signature for a visitor ID
export function signVisitorId(vid: string): string {
  const secret = getSigningSecret();
  const hmac = crypto.createHmac('sha256', secret).update(vid).digest('base64url');
  return `${vid}.${hmac}`;
}

// Verify an HMAC-SHA256 signature for a signed visitor cookie value
export function verifySignedVisitorId(signedValue: string | undefined | null): string | null {
  if (!signedValue || typeof signedValue !== 'string') {
    return null;
  }

  const parts = signedValue.trim().split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [vid, signature] = parts;
  if (!vid || !signature) {
    return null;
  }

  const secret = getSigningSecret();
  const expectedHmac = crypto.createHmac('sha256', secret).update(vid).digest('base64url');

  try {
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedHmac, 'utf8')
    );
    return isMatch ? vid : null;
  } catch {
    return null;
  }
}

// Resolve or create an authenticated visitor ID with active rolling renewal
export function resolveSignedVisitorId(c: Context, explicitId?: string): string {
  const cookieVal = getCookie(c, VISITOR_COOKIE_NAME);
  let resolvedVid = verifySignedVisitorId(cookieVal);

  // If cookie was valid, renew it
  if (resolvedVid) {
    const signed = signVisitorId(resolvedVid);
    setCookie(c, VISITOR_COOKIE_NAME, signed, {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      httpOnly: true,
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return resolvedVid;
  }

  // If cookie was an unsigned legacy cookie or valid explicitId, upgrade and sign
  if (cookieVal && /^[a-zA-Z0-9_\-]{8,64}$/.test(cookieVal.trim())) {
    resolvedVid = cookieVal.trim();
  } else if (explicitId && /^[a-zA-Z0-9_\-]{8,64}$/.test(explicitId.trim())) {
    resolvedVid = explicitId.trim();
  } else {
    resolvedVid = createId();
  }

  const signed = signVisitorId(resolvedVid);
  setCookie(c, VISITOR_COOKIE_NAME, signed, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return resolvedVid;
}

