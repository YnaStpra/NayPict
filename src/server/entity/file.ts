import { index, integer, pgTable, text } from 'drizzle-orm/pg-core';

// file (stores individual file records: original, preview, thumbnail)
export const fileTab = pgTable(
  'file',
  {
    fileId: text('file_id').primaryKey().notNull(),
    photoId: text('photo_id').notNull(),
    key: text('key').notNull().unique(),
    type: integer('type').notNull(),
    fileType: text('file_type').notNull(),
    size: integer('size').notNull(),
  },
  (table) => [
    index('idx_file_photo_type').on(table.photoId, table.type),
  ]
);

export type File = typeof fileTab.$inferSelect;
export type FileInto = typeof fileTab.$inferInsert;

