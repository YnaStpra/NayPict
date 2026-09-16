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

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$|^::(?:[a-fA-F0-9]{1,4}:){0,6}[a-fA-F0-9]{1,4}$|^(?:[a-fA-F0-9]{1,4}:){1,7}:$|^(?:[a-fA-F0-9]{1,4}:){1,6}:[a-fA-F0-9]{1,4}$|^(?:[a-fA-F0-9]{1,4}:)(?::[a-fA-F0-9]{1,4}){1,6}$|^::(?:[a-fA-F0-9]{1,4}:){0,5}(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[a-fA-F0-9]{1,4}:){1,5}:(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// Validate that an IP address string conforms to standard IPv4 or IPv6 syntax.
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string' || ip.length > 45) return false;
  const clean = ip.trim();
  return IPV4_REGEX.test(clean) || IPV6_REGEX.test(clean);
}

// Determine if an IP address belongs to private, loopback, link-local, or cloud metadata ranges.
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!isValidIp(ip)) return true;
  const clean = ip.trim().toLowerCase();

  // IPv4 range checks
  if (IPV4_REGEX.test(clean)) {
    const parts = clean.split('.').map(Number);
    const [a, b, c] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (RFC 1918 Private)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata service 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 – 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (RFC 1918 Private)
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT: 100.64.0.0 – 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 198.18.0.0/15 (Network benchmark testing: 198.18.0.0 – 198.19.255.255)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast: 224 - 239)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved / Future use: 240 - 255)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 range checks
  if (
    clean === '::1' ||
    clean === '::' ||
    clean.startsWith('fe80:') ||
    clean.startsWith('fc00:') ||
    clean.startsWith('fd00:') ||
    clean.startsWith('ff00:') ||
    clean.startsWith('2001:db8:') ||
    clean.startsWith('::ffff:127.') ||
    clean.startsWith('::ffff:10.') ||
    clean.startsWith('::ffff:192.168.') ||
    clean.startsWith('::ffff:169.254.')
  ) {
    return true;
  }

  return false;
}

// Verify that an IP address is a valid, publicly routable Internet address.
export function isPublicIp(ip: string): boolean {
  return isValidIp(ip) && !isPrivateOrReservedIp(ip);
}

