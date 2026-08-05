import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// storage
export const storageTab = sqliteTable('storage', {
  storageId: text('storage_id').primaryKey(),
  name: text('name').notNull(),
  type: integer('type').notNull(),
  domain: text('domain'),
  bucket: text('bucket'),
  region: text('region'),
  endpoint: text('endpoint'),
  accessKey: text('access_key'),
  secretKey: text('secret_key'),
  userId: text('user_id'),
  sort: integer('sort').default(0).notNull(),
  status: integer('status').default(0)
});

export type Storage = typeof storageTab.$inferSelect;
export type StorageInto = typeof storageTab.$inferInsert;
