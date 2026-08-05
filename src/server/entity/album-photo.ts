import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Album photo association
export const albumPhotoTab = sqliteTable('album_photo', {
  id: text('id').primaryKey().notNull(),
  photoId: text('photo_id').notNull(),
  albumId: text('album_id').notNull()
});

export type AlbumPhoto = typeof albumPhotoTab.$inferSelect;
export type AlbumPhotoInto = typeof albumPhotoTab.$inferInsert;
