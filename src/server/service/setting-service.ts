import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  LANDING_PRIORITY_MAX_COUNT,
  LANDING_PRIORITY_PHOTO_IDS_KEY,
  SETTING_KEY,
} from '@/server/const/global';
import { settingTab, type Setting } from '@/server/entity/setting';
import { photoTab } from '@/server/entity/photo';
import { albumPhotoTab } from '@/server/entity/album-photo';
import { albumTab } from '@/server/entity/album';
import { PhotoStatusEnum, PhotoVisibilityEnum } from '@/server/enums/photo-enum';
import BizError from '@/server/error/biz-error';
import {
  SettingOnThisDayEnum,
  SettingPhotoDedupEnum,
  SettingSyncDeleteEnum,
  SettingWatermarkEnum,
  SettingRightClickGuardEnum,
  SettingHideGpsEnum,
} from '@/server/enums/setting-enum';
import { orm, readOrm } from '@/server/infra/db';

// This module handles system settings configuration query and update operations.

const defaultSetting: Setting = {
  syncDelete: SettingSyncDeleteEnum.ENABLE,
  clearLast: 7,
  photoDedup: SettingPhotoDedupEnum.ENABLE,
  onThisDay: SettingOnThisDayEnum.ENABLE,
  watermarkEnabled: SettingWatermarkEnum.DISABLE,
  watermarkText: '© NayPict',
  rightClickGuard: SettingRightClickGuardEnum.DISABLE,
  hidePublicGps: SettingHideGpsEnum.DISABLE,
};

let cachedSetting: Setting | null = null;
let lastSettingFetch = 0;
let cachedLandingPriorityIds: string[] | null = null;
let lastLandingPriorityFetch = 0;
const SETTING_CACHE_TTL = 30000; // 30 seconds
const PHOTO_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

// Normalize and validate up to LANDING_PRIORITY_MAX_COUNT unique photo IDs.
export function sanitizeLandingPriorityPhotoIds(rawIds: unknown): string[] {
  if (!Array.isArray(rawIds)) {
    throw new BizError('landing.invalidPhotoSelection', 400);
  }

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const raw of rawIds) {
    if (typeof raw !== 'string') {
      throw new BizError('landing.invalidPhotoSelection', 400);
    }
    const clean = raw.trim();
    if (!PHOTO_ID_PATTERN.test(clean)) {
      throw new BizError('landing.invalidPhotoSelection', 400);
    }
    if (!seen.has(clean)) {
      seen.add(clean);
      sanitized.push(clean);
    }
  }

  if (sanitized.length > LANDING_PRIORITY_MAX_COUNT) {
    throw new BizError('landing.priorityLimitExceeded', 400);
  }

  return sanitized;
}

export function invalidateLandingPriorityCache(): void {
  cachedLandingPriorityIds = null;
  lastLandingPriorityFetch = 0;
}

const settingService = {

  // Read system configuration from database; insert and return defaults if missing.
  async get(): Promise<Setting> {
    if (cachedSetting && Date.now() - lastSettingFetch < SETTING_CACHE_TTL) {
      return cachedSetting;
    }
    try {
      const [row] = await readOrm
        .select()
        .from(settingTab)
        .where(eq(settingTab.key, SETTING_KEY))
        .limit(1);

      if (!row || !row.value) {
        await this.set(defaultSetting);
        cachedSetting = defaultSetting;
        lastSettingFetch = Date.now();
        return defaultSetting;
      }

      cachedSetting = JSON.parse(row.value) as Setting;
      lastSettingFetch = Date.now();
      return cachedSetting;
    } catch {
      return cachedSetting ?? defaultSetting;
    }
  },

  // Overwrite the entire system configuration with strict boundary validation.
  async set(params: Setting): Promise<void> {
    const safeClearLast = Math.max(1, Math.min(365, Math.floor(Number(params.clearLast) || 7)));
    const safeWatermarkText = typeof params.watermarkText === 'string'
      ? params.watermarkText.replace(/[\0\r\n\t]/g, '').trim().slice(0, 100) || '© NayPict'
      : '© NayPict';

    const validated: Setting = {
      syncDelete: params.syncDelete === SettingSyncDeleteEnum.ENABLE ? SettingSyncDeleteEnum.ENABLE : SettingSyncDeleteEnum.DISABLE,
      clearLast: safeClearLast,
      photoDedup: params.photoDedup === SettingPhotoDedupEnum.ENABLE ? SettingPhotoDedupEnum.ENABLE : SettingPhotoDedupEnum.DISABLE,
      onThisDay: params.onThisDay === SettingOnThisDayEnum.ENABLE ? SettingOnThisDayEnum.ENABLE : SettingOnThisDayEnum.DISABLE,
      watermarkEnabled: params.watermarkEnabled === SettingWatermarkEnum.ENABLE ? SettingWatermarkEnum.ENABLE : SettingWatermarkEnum.DISABLE,
      watermarkText: safeWatermarkText,
      rightClickGuard: params.rightClickGuard === SettingRightClickGuardEnum.ENABLE ? SettingRightClickGuardEnum.ENABLE : SettingRightClickGuardEnum.DISABLE,
      hidePublicGps: params.hidePublicGps === SettingHideGpsEnum.ENABLE ? SettingHideGpsEnum.ENABLE : SettingHideGpsEnum.DISABLE,
    };

    cachedSetting = validated;
    lastSettingFetch = Date.now();
    try {
      await orm
        .insert(settingTab)
        .values({
          key: SETTING_KEY,
          value: JSON.stringify(validated),
        })
        .onConflictDoUpdate({
          target: settingTab.key,
          set: { value: JSON.stringify(validated) },
        });
    } catch (err) {
      if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
        return;
      }
      throw err;
    }
  },

  // Check if public GPS location coordinates should be stripped for guest visitors.
  isPublicGpsHidden(): boolean {
    if (process.env.HIDE_PUBLIC_GPS === 'true') {
      return true;
    }
    return cachedSetting?.hidePublicGps === SettingHideGpsEnum.ENABLE;
  },

  // Read admin-selected priority photo IDs for the public landing page infinite gallery (max 10).
  async getLandingPriorityPhotoIds(): Promise<string[]> {
    if (cachedLandingPriorityIds && Date.now() - lastLandingPriorityFetch < SETTING_CACHE_TTL) {
      return [...cachedLandingPriorityIds];
    }

    try {
      const [row] = await readOrm
        .select()
        .from(settingTab)
        .where(eq(settingTab.key, LANDING_PRIORITY_PHOTO_IDS_KEY))
        .limit(1);

      if (!row || !row.value) {
        cachedLandingPriorityIds = [];
        lastLandingPriorityFetch = Date.now();
        return [];
      }

      const parsed = JSON.parse(row.value);
      const list = Array.isArray(parsed)
        ? parsed
            .filter((id): id is string => typeof id === 'string' && PHOTO_ID_PATTERN.test(id.trim()))
            .map((id) => id.trim())
            .slice(0, LANDING_PRIORITY_MAX_COUNT)
        : [];
      cachedLandingPriorityIds = list;
      lastLandingPriorityFetch = Date.now();
      return [...list];
    } catch {
      return cachedLandingPriorityIds ? [...cachedLandingPriorityIds] : [];
    }
  },

  // Validate and persist up to 10 publicly eligible image IDs for the landing page infinite gallery.
  async setLandingPriorityPhotoIds(rawIds: unknown): Promise<string[]> {
    const cleanIds = sanitizeLandingPriorityPhotoIds(rawIds);

    if (cleanIds.length > 0 && process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
      const eligibleRows = await readOrm
        .select({ photoId: photoTab.photoId })
        .from(photoTab)
        .where(
          and(
            inArray(photoTab.photoId, cleanIds),
            eq(photoTab.status, PhotoStatusEnum.NORMAL),
            or(
              inArray(photoTab.visibility, [PhotoVisibilityEnum.BOTH, PhotoVisibilityEnum.GALLERY_ONLY]),
              isNull(photoTab.visibility)
            )!,
            sql`COALESCE(${photoTab.type}, '') NOT LIKE 'video/%'`,
            sql`NOT EXISTS (
              SELECT 1 FROM ${albumPhotoTab}
              INNER JOIN ${albumTab} ON ${albumTab.albumId} = ${albumPhotoTab.albumId}
              WHERE ${albumPhotoTab.photoId} = ${photoTab.photoId}
              AND ${albumTab.isArchived} = 1
            )`
          )
        );

      const eligibleSet = new Set(eligibleRows.map((row) => row.photoId));
      if (eligibleSet.size !== cleanIds.length) {
        throw new BizError('landing.invalidPhotoSelection', 400);
      }
    }

    cachedLandingPriorityIds = cleanIds;
    lastLandingPriorityFetch = Date.now();

    try {
      await orm
        .insert(settingTab)
        .values({
          key: LANDING_PRIORITY_PHOTO_IDS_KEY,
          value: JSON.stringify(cleanIds),
        })
        .onConflictDoUpdate({
          target: settingTab.key,
          set: { value: JSON.stringify(cleanIds) },
        });
    } catch (err) {
      if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
        return cleanIds;
      }
      throw err;
    }

    return cleanIds;
  }
};

export { settingService };
