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

const settingService = {

  // Read system configuration from database; insert and return defaults if missing.
  async get(): Promise<Setting> {
    try {
      const [row] = await orm
        .select()
        .from(settingTab)
        .where(eq(settingTab.key, SETTING_KEY))
        .limit(1);

      if (!row || !row.value) {
        await this.set(defaultSetting);
        return defaultSetting;
      }

      return JSON.parse(row.value) as Setting;
    } catch {
      return defaultSetting;
    }
  },

  // Overwrite the entire system configuration.
  async set(params: Setting): Promise<void> {
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
