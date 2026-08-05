import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// general cache table
export const cacheTab = sqliteTable('cache', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  expireTime: integer('expire_time')
});

export type Cache = typeof cacheTab.$inferSelect;
export type CacheInto = typeof cacheTab.$inferInsert;
