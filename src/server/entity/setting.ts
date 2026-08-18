import { pgTable, text } from 'drizzle-orm/pg-core';

// setting (key-value system configuration store)
export const settingTab = pgTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export interface SettingConfig {
  syncDelete: number;
  clearLast: number;
  photoDedup: number;
  onThisDay?: number;
}

export type Setting = SettingConfig;
export type SettingDb = typeof settingTab.$inferSelect;
export type SettingInto = typeof settingTab.$inferInsert;
