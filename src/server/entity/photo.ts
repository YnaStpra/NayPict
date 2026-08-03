import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { PhotoFavoriteEnum, PhotoStatusEnum } from '@/server/enums/photo-enum';

// photo
export const photoTab = sqliteTable('photo', {
  photoId: text('photo_id').primaryKey().notNull(), // photoid
  name: text('name').notNull(), // name
  thumbHash: text('thumb_hash'), // blur color
  checksum: text('checksum'), // Original picture SHA-1 Checksum
  type: text('type').notNull(), // photo type
  typeDesc: text('type_desc').notNull(), // Type description
  size: integer('size').notNull(), // file size
  width: integer('width'), // width
  height: integer('height'), // high
  takenTime: text('taken_time'), // Shooting time，priority Exif，none Exif When passed in from the front end lastModified
  createTime: text('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull(), // creation time ISO UTC
  recycleTime: text('recycle_time'), // payback time
  userId: text('user_id').notNull(), // Create userid
  status: integer('status').default(PhotoStatusEnum.NORMAL).notNull(), // state 1normal 2Recycle
  favorite: integer('favorite').default(PhotoFavoriteEnum.NO).notNull(), // collect 1Not favorited 2Collected
  storageId: text('storage_id') // storageid
});

export type Photo = typeof photoTab.$inferSelect;
export type PhotoInto = typeof photoTab.$inferInsert;
