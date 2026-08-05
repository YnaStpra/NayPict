import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// System settings
export const settingTab = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export type Setting = {
  syncDelete: number;
  clearLast: number;
  photoDedup: number;
};
