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

  // Overwrite the entire system configuration.
  async set(params: Setting): Promise<void> {
    cachedSetting = params;
    lastSettingFetch = Date.now();
    await orm
      .insert(settingTab)
      .values({
        key: SETTING_KEY,
        value: JSON.stringify(params),
      })
      .onConflictDoUpdate({
        target: settingTab.key,
        set: { value: JSON.stringify(params) },
      });
  }
};

export { settingService };
