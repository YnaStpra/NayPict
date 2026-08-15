import { Hono, Context } from 'hono';
import { type Setting } from '@/server/entity/setting';
import result from '@/server/model/result';
import { settingService } from '@/server/service/setting-service';
import type { HonoEnv } from '../hono/type';

// This module registers system settings related interfaces.

export function registerSettingApi(app: Hono<HonoEnv>) {
  // Read system settings (public read-only for public gallery mascot configuration)
  app.get('/setting/get', async (c: Context) => {
    const data = await settingService.get();
    return c.json(result.ok(data));
  });

  // Overwrite the entire system settings.
  app.post('/setting/set', async (c: Context) => {
    const body = await c.req.json<Setting>();
    await settingService.set(body);
    return c.json(result.ok());
  });
}
