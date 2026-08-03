import { real as sqliteReal, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { doublePrecision as pgDoublePrecision, pgTable, text as pgText } from 'drizzle-orm/pg-core';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const exifTab: any = isPg
  ? pgTable('exif', {
      photoId: pgText('photo_id').primaryKey().notNull(),
      exif: pgText('exif'),
      latitude: pgDoublePrecision('latitude'),
      longitude: pgDoublePrecision('longitude'),
      altitude: pgDoublePrecision('altitude')
    })
  : sqliteTable('exif', {
      photoId: sqliteText('photo_id').primaryKey().notNull(),
      exif: sqliteText('exif'),
      latitude: sqliteReal('latitude'),
      longitude: sqliteReal('longitude'),
      altitude: sqliteReal('altitude')
    });

export type Exif = typeof exifTab.$inferSelect;
export type ExifInto = typeof exifTab.$inferInsert;
