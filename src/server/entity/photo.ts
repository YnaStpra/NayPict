import { sql } from 'drizzle-orm';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core';
import { PhotoFavoriteEnum, PhotoStatusEnum } from '@/server/enums/photo-enum';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const photoTab: any = isPg
  ? pgTable('photo', {
      photoId: pgText('photo_id').primaryKey().notNull(),
      name: pgText('name').notNull(),
      thumbHash: pgText('thumb_hash'),
      checksum: pgText('checksum'),
      type: pgText('type').notNull(),
      typeDesc: pgText('type_desc').notNull(),
      size: pgInteger('size').notNull(),
      width: pgInteger('width'),
      height: pgInteger('height'),
      takenTime: pgText('taken_time'),
      createTime: pgText('create_time').default(sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`).notNull(),
      recycleTime: pgText('recycle_time'),
      userId: pgText('user_id').notNull(),
      status: pgInteger('status').default(PhotoStatusEnum.NORMAL).notNull(),
      favorite: pgInteger('favorite').default(PhotoFavoriteEnum.NO).notNull(),
      storageId: pgText('storage_id')
    })
  : sqliteTable('photo', {
      photoId: sqliteText('photo_id').primaryKey().notNull(),
      name: sqliteText('name').notNull(),
      thumbHash: sqliteText('thumb_hash'),
      checksum: sqliteText('checksum'),
      type: sqliteText('type').notNull(),
      typeDesc: sqliteText('type_desc').notNull(),
      size: sqliteInteger('size').notNull(),
      width: sqliteInteger('width'),
      height: sqliteInteger('height'),
      takenTime: sqliteText('taken_time'),
      createTime: sqliteText('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(),
      recycleTime: sqliteText('recycle_time'),
      userId: sqliteText('user_id').notNull(),
      status: sqliteInteger('status').default(PhotoStatusEnum.NORMAL).notNull(),
      favorite: sqliteInteger('favorite').default(PhotoFavoriteEnum.NO).notNull(),
      storageId: sqliteText('storage_id')
    });

export type Photo = typeof photoTab.$inferSelect;
export type PhotoInto = typeof photoTab.$inferInsert;
