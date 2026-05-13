/**
 * Rate limiter with optional KV persistence.
 *
 * Falls back to in-memory Map when KV is unavailable (cold start / local dev).
 * KV-backed mode survives cold starts and shares state across all worker instances.
 */

const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_WINDOW_SECONDS = 60;
const KV_PREFIX = "ratelimit:";

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

export interface RateLimiterConfig {
  maxRequests?: number;
  windowSeconds?: number;
}

/**
 * Check if a key has exceeded its rate limit.
 *
 * @param kv  — KV namespace (optional; falls back to in-memory Map)
 * @param key — Unique rate limit key (e.g. session ID, API key)
 * @param opts — Optional overrides for maxRequests / windowSeconds
 * @returns `true` if request is allowed, `false` if rate limited
 */
export async function checkRateLimit(
  kv: KVNamespace | null,
  key: string,
  opts: RateLimiterConfig = {}
): Promise<boolean> {
  const maxRequests = opts.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowSeconds = opts.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const now = Date.now();

  if (kv) {
    return checkKvRateLimit(kv, key, maxRequests, windowSeconds, now);
  }

  return checkMemoryRateLimit(key, maxRequests, windowSeconds, now);
}

// ---- In-memory fallback (per-isolation, resets on cold start) ----

const memMap = new Map<string, RateLimitEntry>();

function checkMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
  now: number
): boolean {
  const entry = memMap.get(key);
  if (!entry || now > entry.resetAt) {
    memMap.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// ---- KV-backed (persistent, shared across instances) ----

async function checkKvRateLimit(
  kv: KVNamespace,
  key: string,
  maxRequests: number,
  windowSeconds: number,
  now: number
): Promise<boolean> {
  const kvKey = KV_PREFIX + key;
  const stored = await kv.get<RateLimitEntry>(kvKey, "json");

  if (!stored || now > stored.resetAt) {
    // Fresh window
    const entry: RateLimitEntry = {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    };
    await kv.put(kvKey, JSON.stringify(entry), {
      expirationTtl: windowSeconds + 5, // buffer for clock skew
    });
    return true;
  }

  if (stored.count >= maxRequests) return false;

  stored.count++;
  await kv.put(kvKey, JSON.stringify(stored), {
    expirationTtl: windowSeconds + 5,
  });
  return true;
}
