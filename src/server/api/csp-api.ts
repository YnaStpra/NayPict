import { Hono, type Context } from 'hono';
import result from '@/server/model/result';
import { getClientIp } from '@/server/lib/ip';
import { cspReportRateLimiter } from '@/server/lib/rate-limiter';
import type { HonoEnv } from '../hono/type';

// This module captures and processes browser Content Security Policy (CSP) violation reports.
const MAX_CSP_REPORT_BYTES = 32 * 1024; // 32 KB ceiling

export function registerCspApi(app: Hono<HonoEnv>) {
  // Capture and process CSP violation reports sent by user agents.
  app.post('/csp-report', async (c: Context) => {
    // 1. Distributed Rate Limiting to prevent telemetry flooding
    const clientIp = getClientIp(c);
    const rateLimit = await cspReportRateLimiter.consume(clientIp);
    if (!rateLimit.allowed) {
      return c.json(result.fail('Too many CSP reports', 429), 429);
    }

    // 2. Reject oversized payloads to prevent memory bloat
    const contentLength = Number(c.req.header('content-length') || 0);
    if (contentLength > MAX_CSP_REPORT_BYTES) {
      return c.json(result.fail('Payload too large', 413), 413);
    }

    try {
      const contentType = c.req.header('content-type') || '';
      let reportData: any = null;

      if (
        contentType.includes('application/json') ||
        contentType.includes('application/csp-report') ||
        contentType.includes('application/reports+json')
      ) {
        reportData = await c.req.json().catch(() => null);
      } else {
        const text = await c.req.text().catch(() => '');
        if (text && text.length <= MAX_CSP_REPORT_BYTES) {
          try {
            reportData = JSON.parse(text);
          } catch {
            reportData = { raw: text.slice(0, 1024) };
          }
        }
      }

      // Log CSP telemetry in non-production environments for active monitoring
      if (reportData && process.env.NODE_ENV !== 'production') {
        const cspReport = reportData['csp-report'] || reportData;
        console.warn('[CSP VIOLATION REPORT]', JSON.stringify(cspReport, null, 2));
      }
    } catch {
      // Gracefully swallow telemetry parsing errors without failing the request
    }

    return c.json(result.ok({ received: true }));
  });
}

