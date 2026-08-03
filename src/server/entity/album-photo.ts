import { sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { pgTable, text as pgText } from 'drizzle-orm/pg-core';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const albumPhotoTab: any = isPg
  ? pgTable('album_photo', {
      id: pgText('id').primaryKey().notNull(),
      photoId: pgText('photo_id').notNull(),
      albumId: pgText('album_id').notNull()
    })
  : sqliteTable('album_photo', {
      id: sqliteText('id').primaryKey().notNull(),
      photoId: sqliteText('photo_id').notNull(),
      albumId: sqliteText('album_id').notNull()
    });

export type AlbumPhoto = typeof albumPhotoTab.$inferSelect;
export type AlbumPhotoInto = typeof albumPhotoTab.$inferInsert;
