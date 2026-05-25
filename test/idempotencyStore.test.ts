// Mock the cloudflare:workers built-in module before any imports
const { mock } = await import("bun:test");
mock.module("cloudflare:workers", () => ({
  DurableObject: class MockDurableObject {
    ctx: any;
    state: any;
    constructor(ctx: any, state: any) {
      this.ctx = ctx;
      this.state = state;
    }
    fetch() {}
    alarm() {}
  },
}));

const { IdempotencyStore } = await import("../src/idempotencyStore");
const {
  describe,
  expect,
  test,
  beforeEach,
  mock: _mock,
} = await import("bun:test");

describe("IdempotencyStore", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    // DurableObject constructor expects a ctx object with storage
    const mockStorage = new Map<string, { storedAt: number }>();
    const mockCtx = {
      storage: {
        get: async <T>(key: string): Promise<T | undefined> =>
          mockStorage.get(key) as T | undefined,
        put: async <T>(key: string, value: T): Promise<void> => {
          mockStorage.set(key, value as { storedAt: number });
        },
        delete: async (key: string | string[]): Promise<boolean | number> => {
          if (Array.isArray(key)) {
            let count = 0;
            for (const k of key) {
              if (mockStorage.delete(k)) count++;
            }
            return count;
          }
          return mockStorage.delete(key);
        },
        list: async <T>(opts?: {
          prefix?: string;
        }): Promise<Map<string, T>> => {
          const result = new Map<string, T>();
          for (const [k, v] of mockStorage) {
            if (!opts?.prefix || k.startsWith(opts.prefix)) {
              result.set(k, v as T);
            }
          }
          return result;
        },
        getAlarm: async (): Promise<number | null> => null,
        setAlarm: async (_scheduledTime: number): Promise<void> => {},
      },
      id: { toString: () => "test-do-id", name: "test-do" },
      waitUntil: (_promise: Promise<unknown>) => {},
    };
    store = new IdempotencyStore(mockCtx as any);
  });

  test("checkAndStore() returns true for new key", async () => {
    const result = await store.checkAndStore("new-key");
    expect(result).toBe(true);
  });

  test("checkAndStore() respects ttlMs parameter", async () => {
    const result = await store.checkAndStore("key-ttl", 7200);
    expect(result).toBe(true);
  });

  test("checkAndStore() returns true for different keys", async () => {
    await store.checkAndStore("first-key");
    const result = await store.checkAndStore("second-key");
    expect(result).toBe(true);
  });

  test("expired() returns true for unknown key", async () => {
    const result = await store.expired("nonexistent-key");
    expect(result).toBe(true);
  });

  test("expired() returns false for recently stored key", async () => {
    await store.checkAndStore("fresh-key");
    const result = await store.expired("fresh-key");
    expect(result).toBe(false);
  });

  test("clear() removes all stored keys", async () => {
    await store.checkAndStore("key-a");
    await store.checkAndStore("key-b");
    await store.clear();
    const expiredA = await store.expired("key-a");
    const expiredB = await store.expired("key-b");
    expect(expiredA).toBe(true);
    expect(expiredB).toBe(true);
  });
});
