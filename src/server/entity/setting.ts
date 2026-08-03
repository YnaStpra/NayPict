import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// System settings，The entire configuration starts with JSON exist value middle。

export const settingTab = sqliteTable('setting', {
  key: text('key').primaryKey(), // configuration key
  value: text('value').notNull() // Configuration JSON
});

export type Setting = {
  syncDelete: number; // Synchronous deletion 1turn on 2closure
  clearLast: number; // How many days will it take for photos in the recycle bin to be automatically cleared?
  photoDedup: number; // Remove duplicate photos 1turn on 2closure
};
