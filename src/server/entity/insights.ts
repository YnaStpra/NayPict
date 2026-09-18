import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { photoTab } from '@/server/entity/photo';

// This module defines the database schema for photo view and interaction analytics.

export const photoViewTab = pgTable(
  'photo_view',
  {
    id: text('id').primaryKey().notNull(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photoTab.photoId, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    type: text('type').notNull().default('view'),
    viewedAt: timestamp('viewed_at', { mode: 'string' }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_photo_view_photo_type').on(table.photoId, table.type),
    index('idx_photo_view_type_time').on(table.type, table.viewedAt),
    index('idx_photo_view_dedup').on(table.photoId, table.visitorId, table.type, table.viewedAt),
  ]
);

export type PhotoView = typeof photoViewTab.$inferSelect;
export type PhotoViewInto = typeof photoViewTab.$inferInsert;
