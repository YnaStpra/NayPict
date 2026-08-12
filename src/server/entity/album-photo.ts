import { pgTable, text } from 'drizzle-orm/pg-core';

// album_photo (many-to-many join table)
export const albumPhotoTab = pgTable('album_photo', {
  id: text('id').primaryKey().notNull(),
  photoId: text('photo_id').notNull(),
  albumId: text('album_id').notNull(),
});

export type AlbumPhoto = typeof albumPhotoTab.$inferSelect;
export type AlbumPhotoInto = typeof albumPhotoTab.$inferInsert;
