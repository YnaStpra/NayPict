import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// photo album
export const albumTab = sqliteTable('album', {
  albumId: text('album_id').primaryKey(), // photo albumid
  name: text('name').notNull(), // Album name
  description: text('description').default('').notNull(), // describe
  sort: integer('sort').default(0).notNull(), // Sort timestamp The larger the value, the closer
  createTime: text('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(), // creation time ISO UTC
  updateTime: text('update_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(), // Update time ISO UTC
  userId: text('user_id').notNull() // Create userid
});

export type Album = typeof albumTab.$inferSelect;
export type AlbumInto = typeof albumTab.$inferInsert;
