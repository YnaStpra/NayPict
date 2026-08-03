import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { bigint as pgBigInt, pgTable, text as pgText } from 'drizzle-orm/pg-core';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const cacheTab: any = isPg
  ? pgTable('cache', {
      key: pgText('key').primaryKey(),
      value: pgText('value').notNull(),
      expireTime: pgBigInt('expire_time', { mode: 'number' })
    })
  : sqliteTable('cache', {
      key: sqliteText('key').primaryKey(),
      value: sqliteText('value').notNull(),
      expireTime: sqliteInteger('expire_time')
    });

export type Cache = typeof cacheTab.$inferSelect;
export type CacheInto = typeof cacheTab.$inferInsert;
