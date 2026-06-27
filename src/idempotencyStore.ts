import { DurableObject } from "cloudflare:workers";

const DEFAULT_TTL_MS = 300_000; // 5 minutes

interface StoredEntry {
  storedAt: number;
}

/**
 * IdempotencyStore — Durable Object for exactly-once trade execution.
 *
 * Prevents duplicate trade submissions within a configurable TTL window.
 * Uses DO SQLite-backed storage for persistence and alarm-based cleanup.
 */
export class IdempotencyStore extends DurableObject {
  /**
   * Check if a key is new (not recently seen) and store it atomically.
   *
   * @param key  — Unique idempotency key (e.g. "trade:binance:BTCUSDT:LONG:0.01")
   * @param ttlMs — Time-to-live in milliseconds (default 5 min)
   * @returns `true` if the key was stored (new request), `false` if duplicate
   */
  async checkAndStore(
    key: string,
    ttlMs: number = DEFAULT_TTL_MS
  ): Promise<boolean> {
    // Wrap read+write+alarm in blockConcurrencyWhile so concurrent
    // requests with the same key cannot interleave between the
    // `get` and the `put`. Without this, two parallel webhooks for
    // the same trade could both pass the duplicate check and both
    // proceed to enqueue. The DO runtime guarantees single-threaded
    // execution inside the block.
    return this.ctx.blockConcurrencyWhile(async () => {
      const existing = await this.ctx.storage.get<StoredEntry>(key);
      if (existing && Date.now() - existing.storedAt < ttlMs) {
        return false; // Duplicate — still within TTL window
      }

      // Store with current timestamp
      await this.ctx.storage.put(key, { storedAt: Date.now() });

      // Schedule alarm for TTL-based cleanup
      const currentAlarm = await this.ctx.storage.getAlarm();
      const nextCleanup = Date.now() + ttlMs;
      if (!currentAlarm || nextCleanup < currentAlarm) {
        await this.ctx.storage.setAlarm(nextCleanup);
      }

      return true;
    });
  }

  /**
   * Check whether a previously stored key has expired.
   */
  async expired(key: string): Promise<boolean> {
    const entry = await this.ctx.storage.get<StoredEntry>(key);
    if (!entry) return true;
    return Date.now() - entry.storedAt >= DEFAULT_TTL_MS;
  }

  /**
   * Alarm handler — cleans up expired entries.
   */
  async alarm(): Promise<void> {
    const all = await this.ctx.storage.list<StoredEntry>();
    const now = Date.now();
    let earliestRemaining = Infinity;

    for (const [key, entry] of all) {
      if (now - entry.storedAt >= DEFAULT_TTL_MS) {
        await this.ctx.storage.delete(key);
      } else {
        // Track earliest still-valid entry for next alarm
        const remaining = entry.storedAt + DEFAULT_TTL_MS - now;
        if (remaining < earliestRemaining) {
          earliestRemaining = remaining;
        }
      }
    }

    // Schedule next alarm if there are still entries to expire
    if (earliestRemaining < Infinity) {
      await this.ctx.storage.setAlarm(Date.now() + earliestRemaining);
    }
  }

  /**
   * Remove all stored keys (for testing/admin).
   */
  async clear(): Promise<void> {
    const all = await this.ctx.storage.list();
    const keys = [...all.keys()];
    if (keys.length > 0) {
      await this.ctx.storage.delete(keys);
    }
  }
}
