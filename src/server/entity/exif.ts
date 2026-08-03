import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// photo Exif，and photo One to one。

export const exifTab = sqliteTable('exif', {
  photoId: text('photo_id').primaryKey().notNull(), // photo id
  exif: text('exif'), // Exif JSON string
  latitude: real('latitude'), // latitude
  longitude: real('longitude'), // longitude
  altitude: real('altitude') // altitude（rice）
});

export type Exif = typeof exifTab.$inferSelect;
export type ExifInto = typeof exifTab.$inferInsert;
