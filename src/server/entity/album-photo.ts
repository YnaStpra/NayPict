import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// album_photo (many-to-many join table with pin support)
export const albumPhotoTab = pgTable('album_photo', {
  id: text('id').primaryKey().notNull(),
  photoId: text('photo_id').notNull(),
  albumId: text('album_id').notNull(),
  isPinned: integer('is_pinned').default(0).notNull(),
  pinnedAt: timestamp('pinned_at'),
});

export type AlbumPhoto = typeof albumPhotoTab.$inferSelect;
export type AlbumPhotoInto = typeof albumPhotoTab.$inferInsert;

