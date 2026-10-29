import { index, integer, pgTable, text } from 'drizzle-orm/pg-core';

// cache (key-value cache store with optional TTL, backed by PostgreSQL)
export const cacheTab = pgTable(
  'cache',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    expireTime: integer('expire_time'),
  },
  (table) => [
    index('idx_cache_expire_time').on(table.expireTime),
  ]
);

export type Cache = typeof cacheTab.$inferSelect;
export type CacheInto = typeof cacheTab.$inferInsert;
