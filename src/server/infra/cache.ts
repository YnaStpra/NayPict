import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { cacheTab } from '@/server/entity/cache'
import { orm } from '@/server/infra/db'

// This module encapsulates cache reading and writing，Currently provided by dbCache write SQLite cache surface。

type CacheSetOptions = {
  // ttl Cache expiration time，Unit second。
  ttl?: number
}

// SQLite Cache implementation。
const dbCache = {

  // write cache，same key then cover。
  async set(key: string, data: object, options?: CacheSetOptions): Promise<void> {
    const value = JSON.stringify(data)
    const expireTime = options?.ttl
      ? Math.floor(Date.now() / 1000) + options.ttl
      : null

    await orm.insert(cacheTab).values({
      key,
      value,
      expireTime,
    }).onConflictDoUpdate({
      target: cacheTab.key,
      set: {
        value,
        expireTime,
      },
    })
  },

  // read cache，Delete and return when expired null。
  async get<T>(key: string): Promise<T | null> {
    const [row] = await orm
      .select()
      .from(cacheTab)
      .where(eq(cacheTab.key, key))
      .limit(1)

    if (!row) {
      return null
    }

    if (row.expireTime != null && row.expireTime <= Math.floor(Date.now() / 1000)) {
      await dbCache.delete(key)
      return null
    }

    return JSON.parse(row.value) as T
  },

  // Delete cache。
  async delete(key: string): Promise<void> {
    await orm.delete(cacheTab).where(eq(cacheTab.key, key))
  },

  // Delete all expired caches。
  async clearExpired(): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    await orm.delete(cacheTab).where(and(
      isNotNull(cacheTab.expireTime),
      lte(cacheTab.expireTime, now),
    ))
  },
}

const cache = {
  // write cache。
  async set(key: string, data: object, options?: CacheSetOptions): Promise<void> {
    return dbCache.set(key, data, options)
  },

  // read cache。
  async get<T>(key: string): Promise<T | null> {
    return dbCache.get<T>(key)
  },

  // Delete cache。
  async delete(key: string): Promise<void> {
    return dbCache.delete(key)
  },

  // Delete all expired caches。
  async clearExpired(): Promise<void> {
    return dbCache.clearExpired()
  },
}

export { cache, type CacheSetOptions }
