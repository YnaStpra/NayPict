import { Hono, Context } from 'hono';
import { type Setting } from '@/server/entity/setting';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { getClientIp } from '@/server/lib/ip';
import { logSecurityAudit } from '@/server/lib/audit';
import { settingService } from '@/server/service/setting-service';
import type { HonoEnv } from '../hono/type';

// This module registers system settings related interfaces.

export function registerSettingApi(app: Hono<HonoEnv>) {
  // Overwrite the entire system settings.
  app.post('/setting/set', async (c: Context) => {
    const body = await c.req.json<Setting>();
    await settingService.set(body);
    logSecurityAudit({
      action: 'SETTING_SET',
      userId: getUserId(),
      clientIp: getClientIp(c),
    });
    return c.json(result.ok());
  });
}
