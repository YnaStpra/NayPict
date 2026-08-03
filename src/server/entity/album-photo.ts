import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// This module defines the association table structure of albums and photos。

// Album photo association
export const albumPhotoTab = sqliteTable('album_photo', {
  id: text('id').primaryKey().notNull(), // associationid
  photoId: text('photo_id').notNull(), // photoid
  albumId: text('album_id').notNull() // photo albumid
});

export type AlbumPhoto = typeof albumPhotoTab.$inferSelect;
export type AlbumPhotoInto = typeof albumPhotoTab.$inferInsert;
