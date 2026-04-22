import { DurableObject } from "cloudflare:workers";

export class IdempotencyStore extends DurableObject {
  private sql: SqlRoom | null = null;

  async initialize(): Promise<void> {
    this.sql = await this.ctx.storage.getSql();
    await this.sql.execute(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
  }

  async checkAndStore(key: string, ttlSeconds: number = 3600): Promise<boolean> {
    if (!this.sql) await this.initialize();

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlSeconds;

    const existing = await this.sql!.execute(
      "SELECT key FROM idempotency_keys WHERE key = ?",
      [key]
    );

    if (existing.length > 0) {
      console.log(`[IdempotencyStore] Key exists: ${key}`);
      return false;
    }

    await this.sql!.execute(
      "INSERT INTO idempotency_keys (key, created_at, expires_at) VALUES (?, ?, ?)",
      [key, now, expiresAt]
    );

    console.log(`[IdempotencyStore] Key stored: ${key}`);
    return true;
  }

  async expired(key: string): Promise<boolean> {
    if (!this.sql) await this.initialize();

    const now = Math.floor(Date.now() / 1000);

    await this.sql!.execute(
      "DELETE FROM idempotency_keys WHERE expires_at < ?",
      [now]
    );

    const result = await this.sql!.execute(
      "SELECT key FROM idempotency_keys WHERE key = ?",
      [key]
    );

    return result.length === 0;
  }

  async cleanup(): Promise<void> {
    if (!this.sql) await this.initialize();

    const now = Math.floor(Date.now() / 1000);
    await this.sql!.execute(
      "DELETE FROM idempotency_keys WHERE expires_at < ?",
      [now]
    );
  }
}