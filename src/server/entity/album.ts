import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// photo album
export const albumTab = sqliteTable('album', {
  albumId: text('album_id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  sort: integer('sort').default(0).notNull(),
  createTime: text('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(),
  updateTime: text('update_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(),
  userId: text('user_id').notNull()
});

export type Album = typeof albumTab.$inferSelect;
export type AlbumInto = typeof albumTab.$inferInsert;
