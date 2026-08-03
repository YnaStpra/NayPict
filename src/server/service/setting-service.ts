import { eq } from 'drizzle-orm';
import { SETTING_KEY } from '@/server/const/global';
import { settingTab, type Setting } from '@/server/entity/setting';
import { orm } from '@/server/infra/db';

// This module handles the data query business set by the system。

const settingService = {

  // Read system configuration，Data has been written when creating the table，must exist。
  async get(): Promise<Setting> {
    const [row] = await orm
      .select()
      .from(settingTab)
      .where(eq(settingTab.key, SETTING_KEY))
      .limit(1);

    return JSON.parse(row.value) as Setting;
  },

  // Overwrite the entire system configuration。
  async set(params: Setting): Promise<void> {
    await orm
      .update(settingTab)
      .set({ value: JSON.stringify(params) })
      .where(eq(settingTab.key, SETTING_KEY));
  }
};

export { settingService };
