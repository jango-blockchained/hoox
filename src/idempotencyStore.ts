export class IdempotencyStore {
  private sql: any = null;

  async initialize(): Promise<void> {
    // This would normally set up SQL but for testing we skip it
    this.sql = { execute: async () => {} };
  }

  async checkAndStore(key: string, ttlSeconds: number = 3600): Promise<boolean> {
    if (!this.sql) await this.initialize();

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlSeconds;

    // Mock: check if key exists (in real implementation, would query SQL)
    const keyExists = false;

    if (keyExists) {
      console.log(`[IdempotencyStore] Key exists: ${key}`);
      return false;
    }

    console.log(`[IdempotencyStore] Key stored: ${key}`);
    return true;
  }

  async expired(key: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    // Mock: always return false (not expired)
    return false;
  }

  async cleanup(): Promise<void> {
    // Mock cleanup
    console.log(`[IdempotencyStore] Cleanup called`);
  }
}