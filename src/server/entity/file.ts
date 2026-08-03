import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { FileTypeEnum } from '@/server/enums/file-enum';

// photo files，One photo corresponds to the original image / HD pictures / Thumbnail multiple records。

export const fileTab = sqliteTable('file', {
  fileId: text('file_id').primaryKey().notNull(), // documentid
  photoId: text('photo_id').notNull(), // photoid
  key: text('key').notNull(), // storagekey
  type: integer('type').notNull().default(FileTypeEnum.ORIGINAL), // File type 1Original picture 2HD pictures 3Thumbnail
  fileType: text('file_type').notNull(), // MIME type
  size: integer('size').notNull() // file size
});

export type File = typeof fileTab.$inferSelect;
export type FileInto = typeof fileTab.$inferInsert;
