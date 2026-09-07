import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { photoTab } from '@/server/entity/photo';

// comment (stores public comments left on photos with optional admin replies)
export const commentTab = pgTable('comment', {
  commentId: text('comment_id').primaryKey().notNull(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photoTab.photoId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  content: text('content').notNull(),
  replyContent: text('reply_content'),
  replyTime: timestamp('reply_time', { mode: 'string' }),
  isHearted: integer('is_hearted').notNull().default(0),
  isPinned: integer('is_pinned').notNull().default(0),
  createTime: timestamp('create_time', { mode: 'string' }).notNull().default(sql`now()`),
});

export type Comment = typeof commentTab.$inferSelect;
export type CommentInto = typeof commentTab.$inferInsert;
