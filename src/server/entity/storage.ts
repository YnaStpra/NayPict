import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// storage
export const storageTab = sqliteTable('storage', {
  storageId: text('storage_id').primaryKey(), // storageid
  name: text('name').notNull(), // Storage name
  type: integer('type').notNull(), // storage type 1local 2object storage
  domain: text('domain'), // Visit domain name
  bucket: text('bucket'), // Bucket name
  region: text('region'), // area
  endpoint: text('endpoint'), // access endpoint
  accessKey: text('access_key'), // access
  secretKey: text('secret_key'), // secret
  userId: text('user_id'), // Create userid
  sort: integer('sort').default(0).notNull(), // Sort timestamp The larger the value, the closer
  status: integer('status').default(0) // state 0enable 1Disable
});

export type Storage = typeof storageTab.$inferSelect;
export type StorageInto = typeof storageTab.$inferInsert;
