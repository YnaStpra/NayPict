import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { UserStatusEnum } from '@/server/enums/user-enum';

// user
export const userTab = sqliteTable('user', {
  userId: text('user_id').primaryKey(), // userid
  username: text('username').notNull().unique(), // username
  password: text('password').notNull(), // password
  salt: text('salt').notNull(), // Salt
  avatar: text('avatar').default('').notNull(), // avatar
  type: integer('type').default(2).notNull(), // type 1administrator 2Ordinary user
  status: integer('status').default(UserStatusEnum.DEFAULT).notNull(), // state 0Enabled by default 1enable 2Disable
  createTime: text('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull() // creation time ISO UTC
});

export type User = typeof userTab.$inferSelect;
export type UserInto = typeof userTab.$inferInsert;
