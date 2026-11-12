import { Hono, Context } from 'hono';
import { revalidatePath } from 'next/cache';
import { type Setting } from '@/server/entity/setting';
import result from '@/server/model/result';
import { getUserId } from '@/server/security/context';
import { getClientIp } from '@/server/lib/ip';
import { logSecurityAudit } from '@/server/lib/audit';
import { LANDING_PRIORITY_MAX_COUNT } from '@/server/const/global';
import { settingService } from '@/server/service/setting-service';
import { invalidatePhotoFastPathCache, photoService } from '@/server/service/photo-service';
import { SettingRightClickGuardEnum } from '@/server/enums/setting-enum';
import type { HonoEnv } from '../hono/type';

// This module registers system settings related interfaces.

export function registerSettingApi(app: Hono<HonoEnv>) {
  // Public system settings query (e.g. right-click protection status for visitors)
  app.get('/setting/public', async (c: Context) => {
    const setting = await settingService.get();
    c.header('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=15');
    c.header('CDN-Cache-Control', 'public, s-maxage=5, stale-while-revalidate=15');
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
      details: {
        syncDelete: body?.syncDelete,
        clearLast: body?.clearLast,
        photoDedup: body?.photoDedup,
        watermarkEnabled: body?.watermarkEnabled,
        watermarkText: body?.watermarkText,
        onThisDay: body?.onThisDay,
        rightClickGuard: body?.rightClickGuard,
      },
    });
    return c.json(result.ok());
  });

  // Retrieve current priority photo IDs and metadata for the landing page infinite gallery (Admin-only via /setting SYSTEM_PATHS).
  app.get('/setting/landing-priority', async (c: Context) => {
    const userId = getUserId();
    const photoIds = await settingService.getLandingPriorityPhotoIds();

    let orderedPhotos = [] as Awaited<ReturnType<typeof photoService.list>>['list'];
    if (photoIds.length > 0) {
      const res = await photoService.list({ size: photoIds.length, photoIds }, userId);
      const map = new Map(res.list.map((p) => [p.photoId, p]));
      orderedPhotos = photoIds.map((id) => map.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    }

    return c.json(result.ok({
      photoIds,
      photos: orderedPhotos,
      maxCount: LANDING_PRIORITY_MAX_COUNT,
    }));
  });

  // Update priority photo IDs (max 10) for the landing page infinite gallery and purge SSR landing cache.
  app.post('/setting/landing-priority', async (c: Context) => {
    const body = await c.req.json<{ photoIds?: unknown }>().catch(() => ({ photoIds: [] }));
    const savedIds = await settingService.setLandingPriorityPhotoIds(body?.photoIds);
    invalidatePhotoFastPathCache();

    try {
      revalidatePath('/');
    } catch {
      // Safe no-op outside Next.js server request lifecycle (e.g. unit tests)
    }

    logSecurityAudit({
      action: 'LANDING_PRIORITY_SET',
      userId: getUserId(),
      clientIp: getClientIp(c),
      details: { count: savedIds.length, photoIds: savedIds },
    });

    return c.json(result.ok({ photoIds: savedIds }));
  });
}
