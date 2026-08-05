import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// photo Exif
export const exifTab = sqliteTable('exif', {
  photoId: text('photo_id').primaryKey().notNull(),
  exif: text('exif'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  altitude: real('altitude')
});

export type Exif = typeof exifTab.$inferSelect;
export type ExifInto = typeof exifTab.$inferInsert;
