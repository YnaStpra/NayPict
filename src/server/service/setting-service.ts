import { eq } from 'drizzle-orm';
import { SETTING_KEY } from '@/server/const/global';
import { settingTab, type Setting } from '@/server/entity/setting';
import {
  SettingOnThisDayEnum,
  SettingPhotoDedupEnum,
  SettingSyncDeleteEnum,
  SettingWatermarkEnum,
  SettingRightClickGuardEnum,
} from '@/server/enums/setting-enum';
import { orm } from '@/server/infra/db';

// This module handles system settings configuration query and update operations.

const defaultSetting: Setting = {
  syncDelete: SettingSyncDeleteEnum.ENABLE,
  clearLast: 7,
  photoDedup: SettingPhotoDedupEnum.ENABLE,
  onThisDay: SettingOnThisDayEnum.ENABLE,
  watermarkEnabled: SettingWatermarkEnum.DISABLE,
  watermarkText: '© NayPict',
  rightClickGuard: SettingRightClickGuardEnum.DISABLE,
};

let cachedSetting: Setting | null = null;
let lastSettingFetch = 0;
const SETTING_CACHE_TTL = 30000; // 30 seconds

const settingService = {

  // Read system configuration from database; insert and return defaults if missing.
  async get(): Promise<Setting> {
    if (cachedSetting && Date.now() - lastSettingFetch < SETTING_CACHE_TTL) {
      return cachedSetting;
    }
    try {
      const [row] = await orm
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
  }
};

export { settingService };
