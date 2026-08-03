import { sql } from 'drizzle-orm';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core';
import { UserStatusEnum } from '@/server/enums/user-enum';

const isPg = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export const userTab: any = isPg
  ? pgTable('user', {
      userId: pgText('user_id').primaryKey(),
      username: pgText('username').notNull().unique(),
      password: pgText('password').notNull(),
      salt: pgText('salt').notNull(),
      avatar: pgText('avatar').default('').notNull(),
      type: pgInteger('type').default(2).notNull(),
      status: pgInteger('status').default(UserStatusEnum.DEFAULT).notNull(),
      createTime: pgText('create_time').default(sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`).notNull()
    })
  : sqliteTable('user', {
      userId: sqliteText('user_id').primaryKey(),
      username: sqliteText('username').notNull().unique(),
      password: sqliteText('password').notNull(),
      salt: sqliteText('salt').notNull(),
      avatar: sqliteText('avatar').default('').notNull(),
      type: sqliteInteger('type').default(2).notNull(),
      status: sqliteInteger('status').default(UserStatusEnum.DEFAULT).notNull(),
      createTime: sqliteText('create_time').default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).notNull()
    });

export type User = typeof userTab.$inferSelect;
export type UserInto = typeof userTab.$inferInsert;
