import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// album
export const albumTab = pgTable(
  'album',
  {
    albumId: text('album_id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    createTime: timestamp('create_time', { withTimezone: true, mode: 'string' }).notNull().default(sql`now()`),
    updateTime: timestamp('update_time', { withTimezone: true, mode: 'string' }).notNull().default(sql`now()`),
    userId: text('user_id').notNull(),
    coverPhotoId: text('cover_photo_id'),
    isManualCover: integer('is_manual_cover').notNull().default(0),
    isArchived: integer('is_archived').notNull().default(0),
  },
  (table) => [
    index('idx_album_user_archived').on(table.userId, table.isArchived),
  ]
);

export type Album = typeof albumTab.$inferSelect;
export type AlbumInto = typeof albumTab.$inferInsert;
