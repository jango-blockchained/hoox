/**
 * Mock for `cloudflare:workers` — workerd runtime module.
 * Provides the `DurableObject` base class for testing environments (bun test)
 * where the workerd runtime is not available.
 */

interface StorageEntry {
  storedAt: number;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  list<T = unknown>(opts?: { prefix?: string }): Promise<Map<string, T>>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  id: { toString(): string; name?: string };
  waitUntil(promise: Promise<unknown>): void;
}

export class DurableObject {
  readonly ctx: DurableObjectState;
  readonly storage: DurableObjectStorage;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
    this.storage = ctx.storage;
  }
}
