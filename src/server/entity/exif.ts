import { doublePrecision, index, pgTable, text } from 'drizzle-orm/pg-core';

// exif (one-to-one with photo, stores GPS and camera metadata)
export const exifTab = pgTable(
  'exif',
  {
    photoId: text('photo_id').primaryKey().notNull(),
    exif: text('exif'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    altitude: doublePrecision('altitude'),
  },
  (table) => [
    index('idx_exif_coords').on(table.latitude, table.longitude),
  ]
);

export type Exif = typeof exifTab.$inferSelect;
export type ExifInto = typeof exifTab.$inferInsert;

