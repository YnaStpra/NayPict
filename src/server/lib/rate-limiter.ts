import { cache, redisClient } from '@/server/infra/cache'

// This module provides a Distributed Rate Limiter supporting Upstash Redis REST, shared PostgreSQL DB cache, and local in-memory sliding window fallback.

export interface RateLimitConfig {
  /** Identifier name for the rate limiter bucket to avoid key collisions */
  name?: string
  /** Maximum number of allowed requests in the time window */
  limit: number
  /** Duration of the sliding window in milliseconds */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
  total: number
}

export class DistributedRateLimiter {
  public readonly name: string
  public readonly limit: number
  public readonly windowMs: number
  private readonly localStore = new Map<string, number[]>()
  private lastCleanup = Date.now()

  constructor(config: RateLimitConfig) {
    this.name = config.name || 'default'
    this.limit = config.limit
    this.windowMs = config.windowMs
  }

  // Check and consume one or more request slots in the distributed sliding window.
  public async consume(key: string, weight = 1): Promise<RateLimitResult> {
    const cleanKey = key?.trim() || 'unknown'
    const redisKey = `ratelimit:${this.name}:${cleanKey}`
    const now = Date.now()

    // 1. First Priority: Atomic Upstash Redis REST if configured
    if (redisClient) {
      try {
        const pipelineResult = await redisClient.pipeline([
          ['INCRBY', redisKey, weight],
          ['PTTL', redisKey],
        ])

        if (pipelineResult && pipelineResult.length >= 2) {
          const total = Number(pipelineResult[0] || weight)
          let pttl = Number(pipelineResult[1])

          if (pttl <= 0) {
            // Set initial expiration TTL on new key
            await redisClient.command(['PEXPIRE', redisKey, this.windowMs])
            pttl = this.windowMs
          }

          const resetMs = Math.max(0, pttl)
          const allowed = total <= this.limit
          const remaining = Math.max(0, this.limit - total)

          return {
            allowed,
            remaining,
            resetMs,
            total,
          }
        }
      } catch (err) {
        console.warn(`[RATE-LIMITER] Redis rate limit pipeline error, falling back:`, err)
      }
    }

    // 2. Second Priority: Distributed Database Cache (Neon PostgreSQL / cacheTab)
    try {
      const windowSec = Math.ceil(this.windowMs / 1000)
      const cached = await cache.get<{ count: number; expiresAt: number }>(redisKey)

      if (cached && cached.expiresAt > now) {
        const total = cached.count + weight
        const resetMs = Math.max(0, cached.expiresAt - now)
        await cache.set(
          redisKey,
          { count: total, expiresAt: cached.expiresAt },
          { ttl: Math.max(1, Math.ceil(resetMs / 1000)) }
        )

        return {
          allowed: total <= this.limit,
          remaining: Math.max(0, this.limit - total),
          resetMs,
          total,
        }
      } else {
        const expiresAt = now + this.windowMs
        await cache.set(redisKey, { count: weight, expiresAt }, { ttl: windowSec })

        return {
          allowed: weight <= this.limit,
          remaining: Math.max(0, this.limit - weight),
          resetMs: this.windowMs,
          total: weight,
        }
      }
    } catch {
      // 3. Third Priority: Local in-memory sliding window fallback
      return this.consumeLocal(cleanKey, weight)
    }
  }

  // Check current limit without consuming a token.
  public async check(key: string): Promise<RateLimitResult> {
    const cleanKey = key?.trim() || 'unknown'
    const redisKey = `ratelimit:${this.name}:${cleanKey}`
    const now = Date.now()

    if (redisClient) {
      try {
        const pipelineResult = await redisClient.pipeline([
          ['GET', redisKey],
          ['PTTL', redisKey],
        ])

        if (pipelineResult && pipelineResult.length >= 2) {
          const total = Number(pipelineResult[0] || 0)
          const pttl = Number(pipelineResult[1] || this.windowMs)
          const resetMs = Math.max(0, pttl > 0 ? pttl : this.windowMs)

          return {
            allowed: total < this.limit,
            remaining: Math.max(0, this.limit - total),
            resetMs,
            total,
          }
        }
      } catch (err) {
        console.warn(`[RATE-LIMITER] Redis check error, falling back:`, err)
      }
    }

    try {
      const cached = await cache.get<{ count: number; expiresAt: number }>(redisKey)
      if (cached && cached.expiresAt > now) {
        const resetMs = Math.max(0, cached.expiresAt - now)
        return {
          allowed: cached.count < this.limit,
          remaining: Math.max(0, this.limit - cached.count),
          resetMs,
          total: cached.count,
        }
      }
      return {
        allowed: true,
        remaining: this.limit,
        resetMs: this.windowMs,
        total: 0,
      }
    } catch {
      return this.checkLocal(cleanKey)
    }
  }

  // Reset rate limit records for a specific key (e.g. upon successful authentication).
  public async reset(key: string): Promise<void> {
    const cleanKey = key?.trim() || 'unknown'
    const redisKey = `ratelimit:${this.name}:${cleanKey}`
    this.localStore.delete(cleanKey)

    if (redisClient) {
      try {
        await redisClient.command(['DEL', redisKey])
      } catch {}
    }

    try {
      await cache.delete(redisKey)
    } catch {}
  }

  // Synchronous in-memory fallback helper
  private consumeLocal(key: string, weight = 1): RateLimitResult {
    this.cleanupStaleEntries()

    const now = Date.now()
    const windowStart = now - this.windowMs

    let timestamps = this.localStore.get(key) || []
    timestamps = timestamps.filter((ts) => ts > windowStart)

    const total = timestamps.length
    const oldest = timestamps[0] || now
    const resetMs = Math.max(0, oldest + this.windowMs - now)

    if (total + weight > this.limit) {
      this.localStore.set(key, timestamps)
      return {
        allowed: false,
        remaining: 0,
        resetMs,
        total,
      }
    }

    for (let i = 0; i < weight; i++) {
      timestamps.push(now)
    }
    this.localStore.set(key, timestamps)

    return {
      allowed: true,
      remaining: Math.max(0, this.limit - timestamps.length),
      resetMs,
      total: timestamps.length,
    }
  }

  private checkLocal(key: string): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.windowMs

    let timestamps = this.localStore.get(key) || []
    timestamps = timestamps.filter((ts) => ts > windowStart)

    const total = timestamps.length
    const oldest = timestamps[0] || now
    const resetMs = Math.max(0, oldest + this.windowMs - now)

    return {
      allowed: total < this.limit,
      remaining: Math.max(0, this.limit - total),
      resetMs,
      total,
    }
  }

  // Periodic cleanup of expired local keys
  private cleanupStaleEntries(): void {
    const now = Date.now()
    if (now - this.lastCleanup < 60_000) {
      return
    }
    this.lastCleanup = now
    const windowStart = now - this.windowMs

    for (const [key, timestamps] of this.localStore.entries()) {
      const validTimestamps = timestamps.filter((ts) => ts > windowStart)
      if (validTimestamps.length === 0) {
        this.localStore.delete(key)
      } else {
        this.localStore.set(key, validTimestamps)
      }
    }
  }
}

// Alias for backwards compatibility
export const SlidingWindowRateLimiter = DistributedRateLimiter

// 1. Login Rate Limiter: Max 5 failed attempts per 15 minutes per IP
export const loginRateLimiter = new DistributedRateLimiter({
  name: 'login',
  limit: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
})

// 2. Download Rate Limiter: Max 30 original downloads per 5 minutes per IP
export const downloadRateLimiter = new DistributedRateLimiter({
  name: 'download',
  limit: 30,
  windowMs: 5 * 60 * 1000, // 5 minutes
})

// 3. Comment Rate Limiter: Max 10 comments per 1 minute per IP
export const commentRateLimiter = new DistributedRateLimiter({
  name: 'comment',
  limit: 10,
  windowMs: 60 * 1000, // 1 minute
})

// 4. TOTP 2FA Rate Limiter: Max 3 failed attempts per 5 minutes per user/tempToken
export const totpRateLimiter = new DistributedRateLimiter({
  name: 'totp',
  limit: 3,
  windowMs: 5 * 60 * 1000, // 5 minutes
})

