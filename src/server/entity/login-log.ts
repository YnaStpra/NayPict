import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// login_log (stores login history logs and session device/ip/location metadata)
export const loginLogTab = pgTable('login_log', {
  logId: text('log_id').primaryKey(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  uuid: text('uuid').notNull(),
  ip: text('ip').notNull().default(''),
  location: text('location').notNull().default(''),
  device: text('device').notNull().default(''),
  browser: text('browser').notNull().default(''),
  os: text('os').notNull().default(''),
  userAgent: text('user_agent').notNull().default(''),
  status: integer('status').notNull().default(1), // 1 = SUCCESS, 0 = FAILED
  isRevoked: integer('is_revoked').notNull().default(0), // 1 = LOGGED OUT / REVOKED
  loginTime: timestamp('login_time', { mode: 'string' }).notNull().default(sql`now()`),
});

export type LoginLog = typeof loginLogTab.$inferSelect;
export type LoginLogInsert = typeof loginLogTab.$inferInsert;
