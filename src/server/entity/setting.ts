import { sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { pgTable, text as pgText } from 'drizzle-orm/pg-core';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const settingTab: any = isPg
  ? pgTable('setting', {
      key: pgText('key').primaryKey(),
      value: pgText('value').notNull()
    })
  : sqliteTable('setting', {
      key: sqliteText('key').primaryKey(),
      value: sqliteText('value').notNull()
    });

export type Setting = {
  syncDelete: number;
  clearLast: number;
  photoDedup: number;
};
