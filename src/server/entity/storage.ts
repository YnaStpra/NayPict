import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const storageTab: any = isPg
  ? pgTable('storage', {
      storageId: pgText('storage_id').primaryKey(),
      name: pgText('name').notNull(),
      type: pgInteger('type').notNull(),
      domain: pgText('domain'),
      bucket: pgText('bucket'),
      region: pgText('region'),
      endpoint: pgText('endpoint'),
      accessKey: pgText('access_key'),
      secretKey: pgText('secret_key'),
      userId: pgText('user_id'),
      sort: pgInteger('sort').default(0).notNull(),
      status: pgInteger('status').default(0)
    })
  : sqliteTable('storage', {
      storageId: sqliteText('storage_id').primaryKey(),
      name: sqliteText('name').notNull(),
      type: sqliteInteger('type').notNull(),
      domain: sqliteText('domain'),
      bucket: sqliteText('bucket'),
      region: sqliteText('region'),
      endpoint: sqliteText('endpoint'),
      accessKey: sqliteText('access_key'),
      secretKey: sqliteText('secret_key'),
      userId: sqliteText('user_id'),
      sort: sqliteInteger('sort').default(0).notNull(),
      status: sqliteInteger('status').default(0)
    });

export type Storage = typeof storageTab.$inferSelect;
export type StorageInto = typeof storageTab.$inferInsert;
