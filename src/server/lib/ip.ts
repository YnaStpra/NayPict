import type { Context } from 'hono';

// This module resolves trusted client IP addresses with Cloudflare network verification.

// Extract the trusted client IP address prioritizing Cloudflare's validated cf-connecting-ip.
export function getClientIp(c: Context): string {
  // 1. Cloudflare network-verified connecting IP (cannot be forged by clients)
  const cfConnectingIp = c.req.header('cf-connecting-ip')?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // 2. Direct edge proxy header (Vercel / reverse proxy)
  const xRealIp = c.req.header('x-real-ip')?.trim();
  if (xRealIp) {
    return xRealIp;
  }

  // 3. Fallback to rightmost IP in x-forwarded-for (appended by the nearest trusted reverse proxy)
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    const parts = forwardedFor.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // In trusted proxy chains, the edge proxy appends to the end of the list.
      // Prioritize the rightmost address to prevent spoofing via client-injected leftmost IPs.
      return parts[parts.length - 1];
    }
  }

  return 'unknown';
}
