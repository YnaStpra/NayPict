import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { UserStatusEnum, UserTypeEnum } from '@/server/enums/user-enum';

// user
export const userTab = pgTable('user', {
  userId: text('user_id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  salt: text('salt').notNull(),
  avatar: text('avatar').notNull().default(''),
  type: integer('type').notNull().default(UserTypeEnum.NORMAL),
  status: integer('status').notNull().default(UserStatusEnum.NORMAL),
  createTime: timestamp('create_time', { mode: 'string' }).notNull().default(sql`now()`),
});

export type User = typeof userTab.$inferSelect;
export type UserInto = typeof userTab.$inferInsert;
