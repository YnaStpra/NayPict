import { app } from '../hono/hono';
import { Context } from 'hono';
import { type Setting } from '@/server/entity/setting';
import result from '@/server/model/result';
import { settingService } from '@/server/service/setting-service';

// This module registers system settings related interfaces。

// Overwrite the entire system settings。
app.post('/setting/set', async (c: Context) => {
  const body = await c.req.json<Setting>();
  await settingService.set(body);
  return c.json(result.ok());
});
