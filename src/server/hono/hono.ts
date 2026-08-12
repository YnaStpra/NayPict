import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import result from '../model/result';
import { cors } from 'hono/cors';
import BizError from '../error/biz-error';
import { security } from '../security/security';
import { i18nMiddleware, t } from '@/server/i18n';
import type { HonoEnv } from './type';

// This module creates Hono App and registers common middleware and error handling.

export function createHonoApp() {
  const instance = new Hono<HonoEnv>().basePath('/api');

  instance.use('*', cors());
  instance.use('*', contextStorage());
  instance.use('*', i18nMiddleware);
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

    console.error(err);
    return c.json(result.fail(err.message));
  });

  return instance;
}

export const app = createHonoApp();
