import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// general cache table，value live JSON，expire_time is the expiration timestamp（Second），Empty means no expiration。

export const cacheTab = sqliteTable('cache', {
  key: text('key').primaryKey(), // cache key
  value: text('value').notNull(), // cache value JSON
  expireTime: integer('expire_time'), // Expiration time unix Second，null Not expired
});

export type Cache = typeof cacheTab.$inferSelect;
export type CacheInto = typeof cacheTab.$inferInsert;
