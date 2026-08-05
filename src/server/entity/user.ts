import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { UserStatusEnum } from '@/server/enums/user-enum';

// user
export const userTab = sqliteTable('user', {
  userId: text('user_id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  salt: text('salt').notNull(),
  avatar: text('avatar').default('').notNull(),
  type: integer('type').default(2).notNull(),
  status: integer('status').default(UserStatusEnum.DEFAULT).notNull(),
  createTime: text('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull()
});

export type User = typeof userTab.$inferSelect;
export type UserInto = typeof userTab.$inferInsert;
