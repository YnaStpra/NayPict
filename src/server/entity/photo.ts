import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { PhotoStatusEnum, PhotoVisibilityEnum } from '@/server/enums/photo-enum';

// photo
export const photoTab = pgTable(
  'photo',
  {
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
    createTime: timestamp('create_time', { mode: 'string' }).notNull().default(sql`now()`),
    recycleTime: text('recycle_time'),
    userId: text('user_id').notNull(),
    status: integer('status').notNull().default(PhotoStatusEnum.NORMAL),
    favorite: integer('favorite').notNull().default(1),
    storageId: text('storage_id'),
    allowDownload: integer('allow_download').notNull().default(0),
    visibility: integer('visibility').notNull().default(PhotoVisibilityEnum.BOTH),
  },
  (table) => [
    index('idx_photo_pub_timeline').on(table.status, table.visibility, table.takenTime, table.createTime),
    index('idx_photo_user_status').on(table.userId, table.status),
    index('idx_photo_checksum').on(table.checksum),
  ]
);

export type Photo = typeof photoTab.$inferSelect;
export type PhotoInto = typeof photoTab.$inferInsert;

