import { integer, pgTable, text } from 'drizzle-orm/pg-core';

// cache (key-value cache store with optional TTL, backed by PostgreSQL)
export const cacheTab = pgTable('cache', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  expireTime: integer('expire_time'),
});

export type Cache = typeof cacheTab.$inferSelect;
export type CacheInto = typeof cacheTab.$inferInsert;
