import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { photoTab } from '@/server/entity/photo';

// comment (stores public comments left on photos)
export const commentTab = pgTable('comment', {
  commentId: text('comment_id').primaryKey().notNull(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photoTab.photoId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  content: text('content').notNull(),
  createTime: timestamp('create_time', { mode: 'string' }).notNull().default(sql`now()`),
});

export type Comment = typeof commentTab.$inferSelect;
export type CommentInto = typeof commentTab.$inferInsert;
