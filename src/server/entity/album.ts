import { sql } from 'drizzle-orm';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const albumTab: any = isPg
  ? pgTable('album', {
      albumId: pgText('album_id').primaryKey(),
      name: pgText('name').notNull(),
      description: pgText('description').default('').notNull(),
      sort: pgInteger('sort').default(0).notNull(),
      createTime: pgText('create_time').default(sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`).notNull(),
      updateTime: pgText('update_time').default(sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`).notNull(),
      userId: pgText('user_id').notNull()
    })
  : sqliteTable('album', {
      albumId: sqliteText('album_id').primaryKey(),
      name: sqliteText('name').notNull(),
      description: sqliteText('description').default('').notNull(),
      sort: sqliteInteger('sort').default(0).notNull(),
      createTime: sqliteText('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(),
      updateTime: sqliteText('update_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(),
      userId: sqliteText('user_id').notNull()
    });

export type Album = typeof albumTab.$inferSelect;
export type AlbumInto = typeof albumTab.$inferInsert;
