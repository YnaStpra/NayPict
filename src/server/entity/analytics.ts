import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { photoTab } from '@/server/entity/photo';

// This module defines the database schema for visitor sessions and media interaction analytics.

export const visitorSessionTab = pgTable(
  'visitor_session',
  {
    id: text('id').primaryKey().notNull(),
    visitorId: text('visitor_id').notNull(),
    ip: text('ip').notNull().default(''),
    country: text('country').notNull().default(''),
    city: text('city').notNull().default(''),
    region: text('region').notNull().default(''),
    browser: text('browser').notNull().default(''),
    browserVersion: text('browser_version').notNull().default(''),
    os: text('os').notNull().default(''),
    device: text('device').notNull().default('Desktop'),
    referrer: text('referrer').notNull().default('Direct'),
    landingPath: text('landing_path').notNull().default('/'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull().default(sql`now()`),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true, mode: 'string' }).notNull().default(sql`now()`),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    mediaCount: integer('media_count').notNull().default(0),
    isAdmin: integer('is_admin').notNull().default(0),
    userLat: text('user_lat').notNull().default(''),
    userLng: text('user_lng').notNull().default(''),
    userLocationName: text('user_location_name').notNull().default(''),
  },
  (table) => [
    index('idx_visitor_session_visitor_id').on(table.visitorId),
    index('idx_visitor_session_started_at').on(table.startedAt),
    index('idx_visitor_session_last_active').on(table.lastActiveAt),
  ]
);

export const visitorActivityTab = pgTable(
  'visitor_activity',
  {
    id: text('id').primaryKey().notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => visitorSessionTab.id, { onDelete: 'cascade' }),
    photoId: text('photo_id')
      .notNull()
      .references(() => photoTab.photoId, { onDelete: 'cascade' }),
    action: text('action').notNull().default('view'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().default(sql`now()`),
  },
  (table) => [
    index('idx_visitor_act_session').on(table.sessionId),
    index('idx_visitor_act_photo_action').on(table.photoId, table.action),
    index('idx_visitor_act_created_at').on(table.createdAt),
  ]
);


export type VisitorSession = typeof visitorSessionTab.$inferSelect;
export type VisitorSessionInsert = typeof visitorSessionTab.$inferInsert;

export type VisitorActivity = typeof visitorActivityTab.$inferSelect;
export type VisitorActivityInsert = typeof visitorActivityTab.$inferInsert;
