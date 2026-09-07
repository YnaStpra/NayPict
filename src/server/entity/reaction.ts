import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { photoTab } from '@/server/entity/photo';

// photo_reaction (stores visitor micro-reactions and public claps/likes per photo)
export const photoReactionTab = pgTable(
  'photo_reaction',
  {
    id: text('id').primaryKey().notNull(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photoTab.photoId, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    reactionType: text('reaction_type').notNull(), // 'love', 'fire', 'camera', 'place', 'clap'
    count: integer('count').notNull().default(1),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().default(sql`now()`),
  },
  (table) => [
    uniqueIndex('idx_photo_reaction_unique').on(table.photoId, table.visitorId, table.reactionType),
    index('idx_photo_reaction_photo_id').on(table.photoId),
  ]
);

export type PhotoReaction = typeof photoReactionTab.$inferSelect;
export type PhotoReactionInto = typeof photoReactionTab.$inferInsert;
