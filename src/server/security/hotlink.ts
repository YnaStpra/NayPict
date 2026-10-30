import type { Context, Next } from 'hono';

// This module provides anti-hotlinking middleware to prevent unauthorized third-party websites from leeching media assets and bandwidth.

// Parse approved hostnames from canonical environment configurations and verified domains.
function getAllowedHosts(): Set<string> {
  const allowed = new Set<string>();

  const addHost = (urlOrHost?: string) => {
    if (!urlOrHost?.trim()) return;
    try {
      const h = urlOrHost.includes('://') ? new URL(urlOrHost).hostname : urlOrHost.split(':')[0];
      if (h) allowed.add(h.toLowerCase().trim());
    } catch {}
  };

  addHost(process.env.APP_URL);
  addHost(process.env.NEXT_PUBLIC_APP_URL);
  addHost(process.env.NEXT_PUBLIC_SITE_URL);
  addHost(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  addHost(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  allowed.add('naypict.my.id');
  allowed.add('www.naypict.my.id');
  allowed.add('naypict.vercel.app');
  allowed.add('localhost');
  allowed.add('127.0.0.1');

  // Add custom whitelisted hotlink domains from env (comma-separated)
  const envAllowed = process.env.ALLOWED_HOTLINK_DOMAINS;
  if (envAllowed) {
    envAllowed.split(',').forEach((d) => addHost(d));
  }

  return allowed;
}

// Intercept cross-site media requests and block hotlinking attempts from unapproved third-party referrers.
export async function antiHotlink(c: Context, next: Next) {
  // Allow hotlink protection bypass if explicitly disabled in environment
  if (process.env.DISABLE_HOTLINK_PROTECTION === 'true') {
    return next();
  }

  const secFetchSite = c.req.header('sec-fetch-site')?.toLowerCase();
  const secFetchMode = c.req.header('sec-fetch-mode')?.toLowerCase();
  const referer = c.req.header('referer');

  // 1. Allow direct browser navigation (opening image URL directly in tab, or download click)
  if (secFetchMode === 'navigate' || (!referer && (!secFetchSite || secFetchSite === 'none'))) {
    return next();
  }

  // 2. Allow same-origin and same-site embeds
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    return next();
  }

  // 3. If request is cross-site or has an external referrer, validate origin
  if (referer) {
    try {
      const refererHost = new URL(referer).hostname.toLowerCase();
      const allowedHosts = getAllowedHosts();

      // Check exact match or subdomain of allowed hosts
      const isAllowed = Array.from(allowedHosts).some((allowed) => {
        return refererHost === allowed || refererHost.endsWith(`.${allowed}`);
      });

      if (!isAllowed) {
        console.warn(`[ANTI-HOTLINK BLOCKED] Unauthorized media embed from referer: ${referer}`);
        return c.text('Hotlinking forbidden by NayPict security policy', 403);
      }
    } catch {
      // Malformed referrer header: reject
      return c.text('Invalid Referer header', 403);
    }
  } else if (secFetchSite === 'cross-site') {
    // Cross-site request with stripped referrer: block
    return c.text('Cross-site media embedding forbidden', 403);
  }

  return next();
}
