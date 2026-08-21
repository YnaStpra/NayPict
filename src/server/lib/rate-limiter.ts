// This module provides an in-memory Sliding Window Rate Limiter for API endpoints.

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  total: number;
}

export class SlidingWindowRateLimiter {
  public readonly limit: number;
  public readonly windowMs: number;
  private readonly store = new Map<string, number[]>();
  private lastCleanup = Date.now();

  constructor(config: RateLimitConfig) {
    this.limit = config.limit;
    this.windowMs = config.windowMs;
  }

  // Check and consume one or more request slots in the sliding window.
  public consume(key: string, weight = 1): RateLimitResult {
    this.cleanupStaleEntries();

    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.store.get(key) || [];
    // Filter out timestamps outside the active sliding window
    timestamps = timestamps.filter((ts) => ts > windowStart);

    const total = timestamps.length;
    const oldest = timestamps[0] || now;
    const resetMs = Math.max(0, oldest + this.windowMs - now);

    if (total + weight > this.limit) {
      this.store.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
        total,
      };
    }

    // Record current request timestamps
    for (let i = 0; i < weight; i++) {
      timestamps.push(now);
    }
    this.store.set(key, timestamps);

    return {
      allowed: true,
      remaining: Math.max(0, this.limit - timestamps.length),
      resetMs,
      total: timestamps.length,
    };
  }

  // Check current limit without consuming a token.
  public check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.store.get(key) || [];
    timestamps = timestamps.filter((ts) => ts > windowStart);

    const total = timestamps.length;
    const oldest = timestamps[0] || now;
    const resetMs = Math.max(0, oldest + this.windowMs - now);

    return {
      allowed: total < this.limit,
      remaining: Math.max(0, this.limit - total),
      resetMs,
      total,
    };
  }

  // Reset rate limit records for a specific key (e.g. upon successful authentication).
  public reset(key: string): void {
    this.store.delete(key);
  }

  // Periodic cleanup of expired keys to prevent memory leaks in long-running instances.
  private cleanupStaleEntries(): void {
    const now = Date.now();
    if (now - this.lastCleanup < 60_000) {
      return;
    }
    this.lastCleanup = now;
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.store.entries()) {
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);
      if (validTimestamps.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, validTimestamps);
      }
    }
  }
}

// 1. Login Rate Limiter: Max 5 failed attempts per 15 minutes per IP
export const loginRateLimiter = new SlidingWindowRateLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

// 2. Download Rate Limiter: Max 30 original downloads per 5 minutes per IP
export const downloadRateLimiter = new SlidingWindowRateLimiter({
  limit: 30,
  windowMs: 5 * 60 * 1000, // 5 minutes
});
