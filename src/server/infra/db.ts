import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'path'
import { schema } from '@/server/infra/schema'

// This module initializes the SQLite database with Vercel serverless /tmp support.

const isVercel = Boolean(process.env.VERCEL)
const dataDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data')

if (!isVercel) {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
  } catch {
    // ignore
  }
}

const dbPath = isVercel ? '/tmp/pictale.sqlite' : path.join(dataDir, 'pictale.sqlite')

// On Vercel, copy initial seed database to /tmp/pictale.sqlite if not present in /tmp
if (isVercel && !fs.existsSync(dbPath)) {
  const seedPath = path.join(process.cwd(), 'data', 'pictale.sqlite')
  if (fs.existsSync(seedPath)) {
    try {
      fs.copyFileSync(seedPath, dbPath)
    } catch (e) {
      console.warn('Failed to copy seed database to /tmp:', e)
    }
  }
}

const sqlite = new Database(dbPath)

export const db = sqlite
export const orm = drizzle(sqlite, { schema: schema as any })
