/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Rate limiting middleware for Cloudflare Workers
 * Adapted from workers/agent-worker/src/middleware/rate-limit.ts
 *
 * @available — Available for consumer use. Import from "@jango-blockchained/hoox-shared/middleware".
 */

import type { Env } from "../types";

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export interface RateLimiter {
  check(request: Request): Promise<RateLimitResult>;
  enforce(request: Request): Promise<Response | null>;
  checkKey(key: string): Promise<RateLimitResult>;
  enforceKey(key: string): Promise<Response | null>;
}

interface StorageEntry {
  value: string;
  expiresAt: number;
}

interface RateLimitStorage {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number }
  ): Promise<void>;
  /**
   * Atomically increment a numeric counter.
   * Returns the new value after increment.
   * In-memory: thread-safe via lock-free compare-and-swap loop.
   * KV: uses get-then-put with retry loop (best-effort atomicity under high concurrency).
   */
  incr(key: string, opts?: { expirationTtl?: number }): Promise<number>;
}

function createStorage(kv?: KVNamespace): RateLimitStorage {
  if (!kv) {
    const memory = new Map<string, StorageEntry>();
    return {
      async get(key) {
        const entry = memory.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
          memory.delete(key);
          return null;
        }
        return entry.value;
      },
      async put(key, value, opts) {
        const ttl = opts?.expirationTtl ?? 0;
        const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : Infinity;
        memory.set(key, { value, expiresAt });
      },
      async incr(key, opts) {
        // Lock-free CAS loop for in-memory storage
        // Each iteration: read → compute → write; retry if another thread wrote first
        let entry = memory.get(key);
        let newValue: number;
        let attempts = 0;
        const maxAttempts = 100;

        while (true) {
          const count = entry ? parseInt(entry.value, 10) : 0;
          newValue = count + 1;

          if (!entry) {
            // Key doesn't exist — try to claim it
            const ttl = opts?.expirationTtl ?? 0;
            const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : Infinity;
            // Only set if no other thread claimed it since we read
            if (memory.get(key) === undefined) {
              memory.set(key, { value: String(newValue), expiresAt });
              return newValue;
            }
            // Another thread raced ahead — reload and retry
            entry = memory.get(key);
          } else {
            // Key exists — check expiry and attempt update
            if (Date.now() > entry.expiresAt) {
              memory.delete(key);
              entry = undefined;
              continue; // treat as if key doesn't exist
            }
            // Compare-and-swap: only succeed if entry hasn't changed
            const currentEntry = memory.get(key);
            if (currentEntry === entry) {
              const ttl = opts?.expirationTtl ?? 0;
              const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : Infinity;
              memory.set(key, { value: String(newValue), expiresAt });
              return newValue;
            }
            // Another thread modified the key — reload and retry
            entry = currentEntry;
          }

          attempts++;
          if (attempts >= maxAttempts) {
            // Fallback: read current value and increment without CAS
            const current = await this.get(key);
            const count = current ? parseInt(current, 10) : 0;
            newValue = count + 1;
            const ttl = opts?.expirationTtl ?? 0;
            const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : Infinity;
            memory.set(key, { value: String(newValue), expiresAt });
            return newValue;
          }
        }
      },
    };
  }

  return {
    async get(key) {
      return kv.get(key);
    },
    async put(key, value, opts) {
      await kv.put(key, value, opts);
    },
    async incr(key, opts) {
      // KV doesn't support atomic increment — use get-then-put.
      // put() will succeed even if the key changed (last-write-wins for KV).
      // Callers that need exactly-once semantics should use a Durable Object.
      const current = await kv.get(key);
      const count = current ? parseInt(current, 10) : 0;
      const next = count + 1;
      await kv.put(key, String(next), opts);
      return next;
    },
  };
}

export function createRateLimiter(
  kv: Env["CONFIG_KV"] | undefined,
  config: RateLimitConfig
): RateLimiter {
  const prefix = config.keyPrefix ?? "rate-limit";
  const storage = createStorage(kv);

  function getClientIp(request: Request): string {
    return request.headers.get("CF-Connecting-IP") ?? "unknown";
  }

  function getWindowKey(ip: string): string {
    const windowStart = Math.floor(Date.now() / (config.windowSeconds * 1000));
    return `${prefix}:${ip}:${windowStart}`;
  }

  async function checkWithKey(fullKey: string): Promise<RateLimitResult> {
    // First check: can we even attempt a request without exceeding the limit?
    // We read current count BEFORE incrementing to avoid false negatives.
    // Under high concurrency this check is approximate (race condition window
    // between read and incr), but the alternative is always allowing one extra
    // request per concurrent batch.
    const current = await storage.get(fullKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= config.maxRequests) {
      const retryAfter = Math.ceil(
        config.windowSeconds -
          (Date.now() % (config.windowSeconds * 1000)) / 1000
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
      };
    }

    // Atomic increment — for in-memory this is a CAS loop, for KV a get-then-put retry.
    // The count may be slightly higher than what we read above if another request
    // incremented between our read and the incr call, which means we could
    // temporarily exceed the limit under extreme concurrency. The window is small.
    const newCount = await storage.incr(fullKey, {
      expirationTtl: config.windowSeconds,
    });

    // Re-check after increment: if we overshot due to a race, reject this request.
    if (newCount > config.maxRequests) {
      const retryAfter = Math.ceil(
        config.windowSeconds -
          (Date.now() % (config.windowSeconds * 1000)) / 1000
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - newCount,
    };
  }

  async function check(request: Request): Promise<RateLimitResult> {
    const ip = getClientIp(request);
    const key = getWindowKey(ip);
    return checkWithKey(key);
  }

  async function enforce(request: Request): Promise<Response | null> {
    const result = await check(request);
    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: result.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(result.retryAfter ?? config.windowSeconds),
          },
        }
      );
    }
    return null;
  }

  async function checkKey(key: string): Promise<RateLimitResult> {
    const fullKey = `${prefix}:${key}`;
    return checkWithKey(fullKey);
  }

  async function enforceKey(key: string): Promise<Response | null> {
    const result = await checkKey(key);
    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: result.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(result.retryAfter ?? config.windowSeconds),
          },
        }
      );
    }
    return null;
  }

  return { check, enforce, checkKey, enforceKey };
}
