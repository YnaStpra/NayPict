import type { Context, Next } from 'hono';
import { getClientIp } from '@/server/lib/ip';
import result from '@/server/model/result';

// This module provides automated bot and scraper detection middleware to reject scraping tools and protect media bandwidth.

// Regex signatures of known scraping libraries, automation drivers, and command-line downloaders
const SCRAPER_USER_AGENT_PATTERNS: RegExp[] = [
  // Python scrapers & HTTP libraries
  /python-requests/i,
  /python-urllib/i,
  /urllib3/i,
  /aiohttp/i,
  /httpx/i,
  /scrapy/i,
  /pycurl/i,
  /mechanize/i,
  /beautifulsoup/i,

  // Command-line downloaders & HTTP CLI tools
  /^curl\//i,
  /^wget\//i,
  /^aria2\//i,
  /^httpie\//i,
  /^postmanruntime\//i,

  // Automation clients, headless frameworks & script engines
  /go-http-client/i,
  /java\/\d/i,
  /libwww-perl/i,
  /php\/\d/i,
  /guzzlehttp/i,
  /httpclient/i,
  /node-fetch/i,
  /undici/i,
  /axios\//i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright(?!.*(?:chrome|safari|firefox))/i,
];

// Exempt known legitimate search engine crawlers so SEO indexing is never disrupted
const LEGITIMATE_SEARCH_BOTS: RegExp[] = [
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /duckduckbot/i,
  /baiduspider/i,
  /applebot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
];

// System paths exempt from bot blocking (such as uptime monitoring probes and internal cron)
const EXEMPT_PATHS = [
  '/health',
  '/api/health',
  '/cron',
  '/api/cron',
  '/csp-report',
  '/api/csp-report',
];

/**
 * Evaluates whether a User-Agent matches known automated scrapers or omits identity.
 */
export function isScraperUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent || userAgent.trim() === '' || userAgent.trim() === '-') {
    return true; // Legitimate browsers always send a descriptive User-Agent
  }

  // Allow legitimate search engine crawlers
  if (LEGITIMATE_SEARCH_BOTS.some((pattern) => pattern.test(userAgent))) {
    return false;
  }

  return SCRAPER_USER_AGENT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Hono middleware to intercept and block automated scrapers before DB or storage operations.
 */
export async function botBlocker(c: Context, next: Next) {
  if (process.env.DISABLE_BOT_BLOCKER === 'true') {
    return next();
  }

  const path = c.req.path;
  if (EXEMPT_PATHS.some((exempt) => path === exempt || path.startsWith(`${exempt}/`))) {
    return next();
  }

  const userAgent = c.req.header('user-agent');

  if (isScraperUserAgent(userAgent)) {
    const clientIp = getClientIp(c);
    const sanitizedUa = (userAgent || 'EMPTY').slice(0, 100).replace(/[\r\n]/g, '');
    console.warn(`[BOT BLOCKED] Rejected automated scraper: IP=${clientIp}, Path=${path}, UA="${sanitizedUa}"`);

    // For /media/ routes: return 403 plain text
    if (path.startsWith('/media')) {
      return c.text('Automated scraping and bot access are strictly forbidden.', 403, {
        'Cache-Control': 'no-store, private',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      });
    }

    // For /api/ routes: return standard 403 JSON
    return c.json(
      result.fail('Automated scraping and bot access are strictly forbidden.', 403),
      403,
      {
        'Cache-Control': 'no-store, private',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      }
    );
  }

  return next();
}
