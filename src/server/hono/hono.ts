import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { compress } from 'hono/compress';
import result from '../model/result';
import BizError from '../error/biz-error';
import { security } from '../security/security';
import { csrfProtection } from '../security/csrf';
import { apiCors } from '../security/cors';
import { i18nMiddleware, t } from '@/server/i18n';
import type { HonoEnv } from './type';

// This module creates Hono App and registers common middleware, compression, and error handling.

export function createHonoApp() {
  const instance = new Hono<HonoEnv>().basePath('/api');

  instance.use('*', compress());
  instance.use('*', apiCors);
  instance.use('*', contextStorage());
  instance.use('*', i18nMiddleware);
  instance.use('*', csrfProtection);
  instance.use('*', security);

  instance.onError((err, c) => {
    if (err instanceof BizError) {
      const message = t(err.message);
      if (err.code === 401 || err.code === 403) {
        return c.json(result.fail(message, err.code), err.code);
      }
      return c.json(result.fail(message, err.code));
    }

    if (err.message?.includes('readonly database')) {
      return c.json(result.fail(t('system.readonly')));
    }

    // Sanitize and redact sensitive credentials (passwords, DB URLs, secret keys) before logging
    const sanitizeErrorLog = (error: unknown) => {
      const str = String(error instanceof Error ? error.stack || error.message : error);
      return str
        .replace(/postgres(ql)?:\/\/[^\s@]+@[^\s/]+/gi, "postgres://[REDACTED_DB_CREDENTIALS]")
        .replace(/(password|jwt_secret|session_secret|secret_access_key|access_key_id)=["']?[^&"'\s]+/gi, "$1=[REDACTED]");
    };

    console.error(sanitizeErrorLog(err));
    // Return generic error — never expose internal stack trace or file paths (LOW-02)
    return c.json(result.fail('An internal server error occurred.'));
  });

  return instance;
}

export const app = createHonoApp();
