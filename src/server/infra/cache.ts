import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { cacheTab } from '@/server/entity/cache'
import { orm } from '@/server/infra/db'

// This module encapsulates cache reading and writing, supporting Upstash Redis REST API with seamless fallback to database cache.

export type CacheSetOptions = {
  // ttl Cache expiration time in seconds
  ttl?: number
}

// Lightweight HTTP REST client for Upstash Redis in serverless / edge environments.
class UpstashRedisClient {
  private readonly url: string
  private readonly token: string

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, '')
    this.token = token
  }

  async command<T = unknown>(cmd: (string | number)[]): Promise<T | null> {
    try {
      const res = await fetch(`${this.url}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cmd),
      })

      if (!res.ok) {
        return null
      }

      const json = (await res.json()) as { result?: T; error?: string }
      if (json.error) {
        return null
      }

      return json.result ?? null
    } catch {
      return null
    }
  }

  async pipeline(cmds: (string | number)[][]): Promise<any[] | null> {
    try {
      const res = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cmds),
      })

      if (!res.ok) return null
      const json = (await res.json()) as { result?: any; error?: string }[]
      return json.map((r) => r.result)
    } catch {
      return null
    }
  }
}

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
const redisClient = upstashUrl && upstashToken ? new UpstashRedisClient(upstashUrl, upstashToken) : null

// Database-backed cache implementation (Neon PostgreSQL / SQLite cacheTab).
const dbCache = {
  // write cache, same key then cover.
  async set(key: string, data: unknown, options?: CacheSetOptions): Promise<void> {
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

  // read cache, delete and return null when expired.
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

  // Delete cache.
  async delete(key: string): Promise<void> {
    await orm.delete(cacheTab).where(eq(cacheTab.key, key))
  },

  // Delete all expired caches.
  async clearExpired(): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    await orm.delete(cacheTab).where(and(
      isNotNull(cacheTab.expireTime),
      lte(cacheTab.expireTime, now),
    ))
  },
}

const cache = {
  // Write cache with optional TTL.
  async set(key: string, data: unknown, options?: CacheSetOptions): Promise<void> {
    if (redisClient) {
      const payload = JSON.stringify(data)
      const cmd: (string | number)[] = options?.ttl
        ? ['SET', key, payload, 'EX', options.ttl]
        : ['SET', key, payload]
      const res = await redisClient.command(cmd)
      if (res !== null) return
    }

    return dbCache.set(key, data, options)
  },

  // Read cache with auto-deserialization.
  async get<T>(key: string): Promise<T | null> {
    if (redisClient) {
      const res = await redisClient.command<string>(['GET', key])
      if (res !== null) {
        try {
          return JSON.parse(res) as T
        } catch {
          return res as unknown as T
        }
      }
    }

    return dbCache.get<T>(key)
  },

  // Delete cache entry by key.
  async delete(key: string): Promise<void> {
    if (redisClient) {
      await redisClient.command(['DEL', key])
    }
    return dbCache.delete(key)
  },

  // Delete all expired caches.
  async clearExpired(): Promise<void> {
    return dbCache.clearExpired()
  },
}

export { cache, redisClient, UpstashRedisClient }

