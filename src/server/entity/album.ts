import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// album
export const albumTab = pgTable('album', {
  albumId: text('album_id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  sort: integer('sort').notNull().default(0),
  createTime: timestamp('create_time', { mode: 'string' }).notNull().default(sql`now()`),
  updateTime: timestamp('update_time', { mode: 'string' }).notNull().default(sql`now()`),
  userId: text('user_id').notNull(),
  coverPhotoId: text('cover_photo_id'),
  isManualCover: integer('is_manual_cover').notNull().default(0),
});

export type Album = typeof albumTab.$inferSelect;
export type AlbumInto = typeof albumTab.$inferInsert;
