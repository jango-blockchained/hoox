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
  afterEach,
  spyOn,
  mock: _mock,
} = await import("bun:test");

describe("IdempotencyStore", () => {
  let store: IdempotencyStore;
  let mockStorage: Map<string, { storedAt: number }>;
  let alarms: number[];
  let deleteCalls: (string | string[])[];
  let fakeNow: number;

  // Bump the fake clock so TTL-sensitive tests can assert expiry deterministically.
  const advanceTime = (ms: number): void => {
    fakeNow += ms;
  };

  beforeEach(() => {
    fakeNow = 0;
    mockStorage = new Map<string, { storedAt: number }>();
    alarms = [];
    deleteCalls = [];
    // Deterministic clock: every test starts at t=0, and advanceTime() bumps it.
    spyOn(Date, "now").mockImplementation(() => fakeNow);

    // DurableObject constructor expects a ctx object with storage
    const mockCtx = {
      storage: {
        get: async <T>(key: string): Promise<T | undefined> =>
          mockStorage.get(key) as T | undefined,
        put: async <T>(key: string, value: T): Promise<void> => {
          mockStorage.set(key, value as { storedAt: number });
        },
        delete: async (key: string | string[]): Promise<boolean | number> => {
          deleteCalls.push(key);
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
        // getAlarm returns the most recently scheduled alarm time, or null.
        // Tests can pre-seed `alarms` to simulate a pre-existing scheduled alarm.
        getAlarm: async (): Promise<number | null> =>
          alarms.length > 0 ? alarms[alarms.length - 1] : null,
        setAlarm: async (scheduledTime: number): Promise<void> => {
          alarms.push(scheduledTime);
        },
      },
      id: { toString: () => "test-do-id", name: "test-do" },
      waitUntil: (_promise: Promise<unknown>) => {},
    };
    store = new IdempotencyStore(mockCtx as any);
  });

  afterEach(() => {
    mock.restore();
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

  describe("TTL and alarm coverage", () => {
    test("checkAndStore() returns false for duplicate within TTL window", async () => {
      // Arrange — store a key at t=0
      await store.checkAndStore("dup-key");

      // Act — re-submit well before the 5-minute TTL elapses
      advanceTime(60_000);
      const result = await store.checkAndStore("dup-key");

      // Assert
      expect(result).toBe(false);
    });

    test("checkAndStore() re-stores key after TTL has passed", async () => {
      // Arrange — store a key at t=0
      await store.checkAndStore("expire-key");

      // Act — advance past the default 5-minute TTL (use 10 minutes for headroom)
      advanceTime(600_000);
      const result = await store.checkAndStore("expire-key");

      // Assert — entry is overwritten with the new timestamp
      expect(result).toBe(true);
      expect(mockStorage.get("expire-key")?.storedAt).toBe(600_000);
    });

    test("checkAndStore() does not reschedule alarm when current alarm is sooner", async () => {
      // Arrange — simulate a pre-existing alarm scheduled earlier than our next cleanup
      alarms.push(100_000);

      // Act — request a cleanup that would land later than the existing alarm
      const result = await store.checkAndStore("soon-alarm", 300_000);

      // Assert — setAlarm should NOT be called; pre-existing alarm is preserved
      expect(result).toBe(true);
      expect(alarms).toEqual([100_000]);
    });

    test("checkAndStore() does reschedule alarm when current alarm is null", async () => {
      // Arrange — alarms is empty (getAlarm returns null)
      expect(alarms).toEqual([]);

      // Act
      const result = await store.checkAndStore("no-alarm");

      // Assert — setAlarm should be called exactly once with the new cleanup time
      expect(result).toBe(true);
      expect(alarms.length).toBe(1);
      expect(alarms[0]).toBe(300_000);
    });

    test("alarm() deletes expired entries and keeps fresh ones", async () => {
      // Arrange — one stale entry (10 min ago, well past TTL) and one fresh entry
      mockStorage.set("stale-key", { storedAt: -600_000 });
      mockStorage.set("fresh-key", { storedAt: 0 });
      alarms.length = 0;

      // Act
      await store.alarm();

      // Assert — only the fresh entry survives; next alarm is scheduled
      expect(mockStorage.has("stale-key")).toBe(false);
      expect(mockStorage.has("fresh-key")).toBe(true);
      expect(alarms).toEqual([300_000]);
    });

    test("alarm() reschedules next alarm when valid entries remain", async () => {
      // Arrange — single fresh entry at t=0
      mockStorage.set("valid-key", { storedAt: 0 });
      alarms.length = 0;

      // Act
      await store.alarm();

      // Assert — setAlarm called with storedAt + TTL - now = 0 + 300_000 - 0
      expect(alarms).toEqual([300_000]);
    });

    test("alarm() does not reschedule when no entries exist", async () => {
      // Arrange — empty storage, no prior alarm
      expect(mockStorage.size).toBe(0);
      alarms.length = 0;

      // Act
      await store.alarm();

      // Assert — setAlarm is NOT called (earliestRemaining stays Infinity)
      expect(alarms).toEqual([]);
    });

    test("clear() is a no-op when storage is empty", async () => {
      // Arrange — no keys stored, no prior delete calls
      expect(mockStorage.size).toBe(0);
      deleteCalls.length = 0;

      // Act
      await store.clear();

      // Assert — delete must not be invoked on the empty-storage skip branch
      expect(deleteCalls).toEqual([]);
    });

    test("expired() returns true when an entry has aged beyond default TTL", async () => {
      // Arrange — directly insert an entry that is 10 minutes old (past 5-min TTL)
      mockStorage.set("ancient-key", { storedAt: -600_000 });

      // Act
      const result = await store.expired("ancient-key");

      // Assert
      expect(result).toBe(true);
    });
  });
});
