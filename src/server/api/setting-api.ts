import { Hono, Context } from 'hono';
import { type Setting } from '@/server/entity/setting';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { getClientIp } from '@/server/lib/ip';
import { logSecurityAudit } from '@/server/lib/audit';
import { settingService } from '@/server/service/setting-service';
import { SettingRightClickGuardEnum } from '@/server/enums/setting-enum';
import type { HonoEnv } from '../hono/type';

// This module registers system settings related interfaces.

export function registerSettingApi(app: Hono<HonoEnv>) {
  // Public system settings query (e.g. right-click protection status for visitors)
  app.get('/setting/public', async (c: Context) => {
    const setting = await settingService.get();
    c.header('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    c.header('CDN-Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return c.json(result.ok({
      rightClickGuard: setting.rightClickGuard === SettingRightClickGuardEnum.ENABLE,
    }));
  });

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
