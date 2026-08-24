import { Hono, type Context } from 'hono';
import result from '@/server/model/result';
import type { HonoEnv } from '../hono/type';

// This module captures and processes browser Content Security Policy (CSP) violation reports.

export function registerCspApi(app: Hono<HonoEnv>) {
  // Capture and process CSP violation reports sent by user agents.
  app.post('/csp-report', async (c: Context) => {
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
        if (text) {
          try {
            reportData = JSON.parse(text);
          } catch {
            reportData = { raw: text };
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
