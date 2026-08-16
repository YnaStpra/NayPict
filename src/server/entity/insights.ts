import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { photoTab } from '@/server/entity/photo';

// This module defines the database schema for photo view and interaction analytics.

export const photoViewTab = pgTable('photo_view', {
  id: text('id').primaryKey().notNull(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photoTab.photoId, { onDelete: 'cascade' }),
  visitorId: text('visitor_id').notNull(),
  type: text('type').notNull().default('view'),
  viewedAt: timestamp('viewed_at', { mode: 'string' }).notNull().default(sql`now()`),
});

export type PhotoView = typeof photoViewTab.$inferSelect;
export type PhotoViewInto = typeof photoViewTab.$inferInsert;
