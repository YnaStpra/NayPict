import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { FileTypeEnum } from '@/server/enums/file-enum';

// photo files
export const fileTab = sqliteTable('file', {
  fileId: text('file_id').primaryKey().notNull(),
  photoId: text('photo_id').notNull(),
  key: text('key').notNull(),
  type: integer('type').notNull().default(FileTypeEnum.ORIGINAL),
  fileType: text('file_type').notNull(),
  size: integer('size').notNull()
});

export type File = typeof fileTab.$inferSelect;
export type FileInto = typeof fileTab.$inferInsert;
