import Database from 'better-sqlite3'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { neon } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import fs from 'node:fs'
import path from 'path'
import { schema } from '@/server/infra/schema'

// This module handles dual database connections: Neon PostgreSQL for Vercel/Cloud and SQLite for local development.

let dbInstance: any
let ormInstance: any

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
  const sql = neon(dbUrl)
  dbInstance = {
    exec: async (query: string) => (sql as any)(query),
    transaction: (fn: Function) => fn()
  }
  ormInstance = drizzleNeon(sql, { schema: schema as any })
} else {
  const dataDir = path.join(process.cwd(), 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const sqlite = new Database(path.join(dataDir, 'pixtale.sqlite'))
  dbInstance = sqlite
  ormInstance = drizzleSqlite(sqlite, { schema: schema as any })
}

export const db = dbInstance
export const orm = ormInstance
