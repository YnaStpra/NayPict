import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core';
import { FileTypeEnum } from '@/server/enums/file-enum';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const fileTab: any = isPg
  ? pgTable('file', {
      fileId: pgText('file_id').primaryKey().notNull(),
      photoId: pgText('photo_id').notNull(),
      key: pgText('key').notNull(),
      type: pgInteger('type').notNull().default(FileTypeEnum.ORIGINAL),
      fileType: pgText('file_type').notNull(),
      size: pgInteger('size').notNull()
    })
  : sqliteTable('file', {
      fileId: sqliteText('file_id').primaryKey().notNull(),
      photoId: sqliteText('photo_id').notNull(),
      key: sqliteText('key').notNull(),
      type: sqliteInteger('type').notNull().default(FileTypeEnum.ORIGINAL),
      fileType: sqliteText('file_type').notNull(),
      size: sqliteInteger('size').notNull()
    });

export type File = typeof fileTab.$inferSelect;
export type FileInto = typeof fileTab.$inferInsert;
