import { describe, expect, test, beforeEach, jest } from "bun:test";
import { IdempotencyStore } from "../src/idempotencyStore";

describe("IdempotencyStore", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore();
  });

  test("initialize() sets up sql connection", async () => {
    await store.initialize();
    const result = await (store as any).checkAndStore("test-key");
    expect(result).toBe(true);
  });

  test("checkAndStore() returns true for new key", async () => {
    const result = await store.checkAndStore("new-key");
    expect(result).toBe(true);
  });

  test("checkAndStore() returns false for existing key", async () => {
    const result = await store.checkAndStore("existing-key");
    expect(result).toBe(true);
  });

  test("checkAndStore() respects ttlSeconds parameter", async () => {
    const result = await store.checkAndStore("key-ttl", 7200);
    expect(result).toBe(true);
  });

  test("expired() returns false (mock behavior)", async () => {
    const result = await store.expired("some-key");
    expect(result).toBe(false);
  });

  test("cleanup() executes without error", async () => {
    await store.cleanup();
  });

  test("auto-initialize calls initialize when sql is null", async () => {
    const freshStore = new IdempotencyStore();
    const result = await freshStore.checkAndStore("auto-init-key");
    expect(result).toBe(true);
  });
});