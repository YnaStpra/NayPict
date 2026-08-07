import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { PhotoFavoriteEnum, PhotoStatusEnum } from '@/server/enums/photo-enum';

// photo
export const photoTab = sqliteTable('photo', {
  photoId: text('photo_id').primaryKey().notNull(),
  name: text('name').notNull(),
  thumbHash: text('thumb_hash'),
  checksum: text('checksum'),
  type: text('type').notNull(),
  typeDesc: text('type_desc').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  takenTime: text('taken_time'),
  createTime: text('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(),
  recycleTime: text('recycle_time'),
  userId: text('user_id').notNull(),
  status: integer('status').default(PhotoStatusEnum.NORMAL).notNull(),
  favorite: integer('favorite').default(PhotoFavoriteEnum.NO).notNull(),
  storageId: text('storage_id'),
  allowDownload: integer('allow_download').default(0).notNull()
});

export type Photo = typeof photoTab.$inferSelect;
export type PhotoInto = typeof photoTab.$inferInsert;
