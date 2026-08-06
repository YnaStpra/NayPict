import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'path'
import { schema } from '@/server/infra/schema'

// This module initializes the local SQLite database.

const dataDir = path.join(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

const sqlite = new Database(path.join(dataDir, 'pictale.sqlite'))

export const db = sqlite
export const orm = drizzle(sqlite, { schema: schema as any })
