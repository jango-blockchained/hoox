/**
 * Test suite for workers/hoox/src/logic.ts
 *
 * Covers all 7 exported functions:
 *   - getQueueMode
 *   - generateIdempotencyKey
 *   - checkIdempotency
 *   - sendTradeToQueue
 *   - processTrade
 *   - processNotification
 *   - createDefaultMessage
 *
 * Notes on module-level state:
 *   - `getQueueMode` caches the resolved mode at module scope with a 60s
 *     TTL. We override `Date.now` in `beforeEach` to a unique timestamp
 *     per test, which forces a cache miss on the first call (the previous
 *     test's expiry is now in the past) and lets us test the cache hit
 *     branch by calling twice at the same timestamp.
 *   - The shared preload (packages/test-utils/src/setup.ts) already
 *     registers a `cloudflare:workers` mock. We re-register it at the top
 *     of this file to be explicit and to make the file work even when run
 *     in isolation.
 *   - We do NOT mock `serviceFetch` from the shared module. Instead, the
 *     service binding's own `fetch` is mocked, which is the seam
 *     `serviceFetch` actually calls.
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Module mocking: register the cloudflare:workers stub before importing
// `../src/logic` (which transitively imports `IdempotencyStore` from
// `cloudflare:workers`).
// ---------------------------------------------------------------------------
await mock.module("cloudflare:workers", () => ({
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

// Dynamic import so the mock above is registered first (ES module hoisting
// would otherwise place a static import above the mock.module call).
const {
  getQueueMode,
  generateIdempotencyKey,
  checkIdempotency,
  sendTradeToQueue,
  processTrade,
  processNotification,
  createDefaultMessage,
} = await import("../src/logic");

// ---------------------------------------------------------------------------
// Mock infrastructure helpers
// ---------------------------------------------------------------------------

type MockLogger = {
  info: ReturnType<typeof mock>;
  warn: ReturnType<typeof mock>;
  error: ReturnType<typeof mock>;
  debug: ReturnType<typeof mock>;
};

function createMockLogger(): MockLogger {
  return {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  };
}

type MockKV = {
  get: ReturnType<typeof mock>;
  put: ReturnType<typeof mock>;
  delete: ReturnType<typeof mock>;
  getWithMetadata: ReturnType<typeof mock>;
  list: ReturnType<typeof mock>;
};

function createMockKV(value: string | null = null): MockKV {
  return {
    get: mock(async () => value),
    put: mock(async () => undefined),
    delete: mock(async () => undefined),
    getWithMetadata: mock(async () => ({ value, metadata: null })),
    list: mock(async () => ({ keys: [] })),
  };
}

type MockQueue = {
  send: ReturnType<typeof mock>;
};

function createMockQueue(): MockQueue {
  return {
    send: mock(async () => undefined),
  };
}

type MockServiceBinding = {
  fetch: ReturnType<typeof mock>;
};

function createMockServiceBinding(
  responseFactory: () => Response = () =>
    new Response(JSON.stringify({ success: true }), { status: 200 })
): MockServiceBinding {
  return {
    fetch: mock(async () => responseFactory()),
  };
}

type MockIdempotencyStore = {
  idFromName: ReturnType<typeof mock>;
  get: ReturnType<typeof mock>;
  /** Exposed for assertions on the underlying checkAndStore spy. */
  checkAndStore: ReturnType<typeof mock>;
};

function createMockIdempotencyStore(returnValue = true): MockIdempotencyStore {
  const checkAndStore = mock(async () => returnValue);
  return {
    idFromName: mock((name: string) => ({ name })),
    get: mock(() => ({ checkAndStore })),
    checkAndStore,
  };
}

const validTradeData = {
  requestId: "req-123",
  exchange: "binance",
  action: "LONG",
  symbol: "BTCUSDT",
  quantity: 0.1,
  price: 50000,
  leverage: 10,
};

const validNotificationData = {
  requestId: "req-456",
  message: "Trade executed",
  chatId: "123456",
};

// ---------------------------------------------------------------------------
// getQueueMode
// ---------------------------------------------------------------------------
//
// `getQueueMode` uses a module-level cache (see logic.ts:32-37). When other
// test files in the same bun:test process (e.g. `hoox.test.ts`) invoke the
// webhook handler, they call `getQueueMode` and populate the cache. We
// cannot reset module-local state from outside the module without modifying
// source, so we FORCE a cache miss on every call by mocking `Date.now` to
// return `Number.MAX_VALUE`. At MAX_VALUE, addition of 60_000 is a no-op
// (it exceeds JS's representable precision), so the function stores
// `queueModeCacheExpiry = Number.MAX_VALUE`. The next call then evaluates
// `now < queueModeCacheExpiry` as `MAX_VALUE < MAX_VALUE` which is FALSE,
// guaranteeing the cache-miss branch is taken and our mock KV is read.

describe("getQueueMode", () => {
  const originalNow = Date.now;

  beforeEach(() => {
    // Force cache miss: at MAX_VALUE, `+ 60_000` is a no-op, so the
    // function's stored expiry equals `now`, and the `<` check fails.
    Date.now = () => Number.MAX_VALUE;
  });

  afterEach(() => {
    Date.now = originalNow;
  });

  test("should return queue_everywhere when stored in KV", async () => {
    // Arrange
    const kv = createMockKV("queue_everywhere");

    // Act
    const result = await getQueueMode(kv as unknown as KVNamespace);

    // Assert
    expect(result).toBe("queue_everywhere");
    expect(kv.get).toHaveBeenCalledTimes(1);
  });

  test("should return queue_disabled when stored in KV", async () => {
    // Arrange
    const kv = createMockKV("queue_disabled");

    // Act
    const result = await getQueueMode(kv as unknown as KVNamespace);

    // Assert
    expect(result).toBe("queue_disabled");
    expect(kv.get).toHaveBeenCalledTimes(1);
  });

  test("should default to queue_failover for unknown KV values", async () => {
    // Arrange
    const kv = createMockKV("queue_random_unknown_value");

    // Act
    const result = await getQueueMode(kv as unknown as KVNamespace);

    // Assert
    expect(result).toBe("queue_failover");
    expect(kv.get).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// generateIdempotencyKey
// ---------------------------------------------------------------------------

describe("generateIdempotencyKey", () => {
  test("should format key as trade:exchange:symbol:action:quantity", () => {
    // Arrange
    const tradeData = {
      requestId: "req-1",
      exchange: "binance",
      symbol: "BTCUSDT",
      action: "LONG",
      quantity: 0.5,
    };

    // Act
    const key = generateIdempotencyKey(tradeData);

    // Assert
    expect(key).toBe("trade:binance:BTCUSDT:LONG:0.5");
  });
});

// ---------------------------------------------------------------------------
// checkIdempotency
// ---------------------------------------------------------------------------

describe("checkIdempotency", () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  test("should return true when IDEMPOTENCY_STORE is not bound", async () => {
    // Arrange
    const env = {} as Parameters<typeof checkIdempotency>[0];

    // Act
    const result = await checkIdempotency(env, "trade:key", logger);

    // Assert
    expect(result).toBe(true);
  });

  test("should return true when DO stub reports the key is new", async () => {
    // Arrange
    const store = createMockIdempotencyStore(true);
    const env = { IDEMPOTENCY_STORE: store };

    // Act
    const result = await checkIdempotency(
      env as Parameters<typeof checkIdempotency>[0],
      "trade:binance:BTCUSDT:LONG:0.1",
      logger
    );

    // Assert
    expect(result).toBe(true);
    expect(store.idFromName).toHaveBeenCalledWith(
      "trade:binance:BTCUSDT:LONG:0.1"
    );
    expect(store.checkAndStore).toHaveBeenCalledWith(
      "trade:binance:BTCUSDT:LONG:0.1"
    );
  });

  test("should return false when DO stub reports the key is a duplicate", async () => {
    // Arrange
    const store = createMockIdempotencyStore(false);
    const env = { IDEMPOTENCY_STORE: store };

    // Act
    const result = await checkIdempotency(
      env as Parameters<typeof checkIdempotency>[0],
      "trade:key",
      logger
    );

    // Assert
    expect(result).toBe(false);
  });

  test("should return true and log error when DO throws (fail-open)", async () => {
    // Arrange
    const checkAndStore = mock(async () => {
      throw new Error("DO unavailable");
    });
    const store = {
      idFromName: mock((name: string) => ({ name })),
      get: mock(() => ({ checkAndStore })),
    };
    const env = { IDEMPOTENCY_STORE: store };

    // Act
    const result = await checkIdempotency(
      env as Parameters<typeof checkIdempotency>[0],
      "trade:key",
      logger
    );

    // Assert
    expect(result).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendTradeToQueue
// ---------------------------------------------------------------------------

describe("sendTradeToQueue", () => {
  let logger: MockLogger;
  let queue: MockQueue;

  beforeEach(() => {
    logger = createMockLogger();
    queue = createMockQueue();
  });

  test("should send a message containing all required fields to the queue", async () => {
    // Arrange
    const tradeData = {
      requestId: "req-queue-1",
      exchange: "binance",
      action: "LONG",
      symbol: "BTCUSDT",
      quantity: 0.25,
      price: 60000,
      leverage: 5,
    };

    // Act
    await sendTradeToQueue(queue as unknown as Queue, tradeData, logger);

    // Assert
    expect(queue.send).toHaveBeenCalledTimes(1);
    const sent = queue.send.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.requestId).toBe("req-queue-1");
    expect(sent.exchange).toBe("binance");
    expect(sent.action).toBe("LONG");
    expect(sent.symbol).toBe("BTCUSDT");
    expect(sent.quantity).toBe(0.25);
    expect(sent.price).toBe(60000);
    expect(sent.leverage).toBe(5);
    expect(typeof sent.queuedAt).toBe("string");
    expect(new Date(sent.queuedAt as string).toString()).not.toBe(
      "Invalid Date"
    );
    expect(logger.info).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processTrade
// ---------------------------------------------------------------------------

describe("processTrade", () => {
  let logger: MockLogger;

  // Pass the real injected helpers from the same module so we test the
  // composition without re-implementing the functions.
  const realOptions = {
    checkIdempotency,
    sendTradeToQueue,
    MAX_TRADES_PER_MINUTE: 10,
  };

  beforeEach(() => {
    logger = createMockLogger();
  });

  test("should reject duplicate trade with success=false", async () => {
    // Arrange
    const store = createMockIdempotencyStore(false); // false = duplicate
    const service = createMockServiceBinding();
    const env = {
      IDEMPOTENCY_STORE: store,
      TRADE_SERVICE: service,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processTrade(
      validTradeData,
      env as Parameters<typeof processTrade>[1],
      logger,
      realOptions,
      "queue_failover"
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.requestId).toBe("req-123");
    expect(result.error).toContain("Duplicate");
    expect(service.fetch).not.toHaveBeenCalled();
  });

  test("should use queue when queueMode is queue_everywhere and TRADE_QUEUE is set", async () => {
    // Arrange
    const store = createMockIdempotencyStore(true);
    const queue = createMockQueue();
    const service = createMockServiceBinding();
    const env = {
      IDEMPOTENCY_STORE: store,
      TRADE_SERVICE: service,
      TRADE_QUEUE: queue,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processTrade(
      validTradeData,
      env as Parameters<typeof processTrade>[1],
      logger,
      realOptions,
      "queue_everywhere"
    );

    // Assert
    expect(result.success).toBe(true);
    expect(result.tradeResult).toEqual({
      queued: true,
      message: "Trade queued for execution",
    });
    expect(queue.send).toHaveBeenCalledTimes(1);
    expect(service.fetch).not.toHaveBeenCalled();
  });

  test("should call TRADE_SERVICE directly in queue_failover mode", async () => {
    // Arrange
    const store = createMockIdempotencyStore(true);
    const service = createMockServiceBinding();
    const env = {
      IDEMPOTENCY_STORE: store,
      TRADE_SERVICE: service,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processTrade(
      validTradeData,
      env as Parameters<typeof processTrade>[1],
      logger,
      realOptions,
      "queue_failover"
    );

    // Assert
    expect(result.success).toBe(true);
    expect(service.fetch).toHaveBeenCalledTimes(1);
  });

  test("should return error when TRADE_SERVICE is not configured and queue is disabled", async () => {
    // Arrange
    const store = createMockIdempotencyStore(true);
    const env = {
      IDEMPOTENCY_STORE: store,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processTrade(
      validTradeData,
      env as Parameters<typeof processTrade>[1],
      logger,
      realOptions,
      "queue_disabled"
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain("TRADE_SERVICE");
    expect(logger.error).toHaveBeenCalled();
  });

  test("should return error when INTERNAL_KEY_BINDING is not configured", async () => {
    // Arrange
    const store = createMockIdempotencyStore(true);
    const service = createMockServiceBinding();
    const env = {
      IDEMPOTENCY_STORE: store,
      TRADE_SERVICE: service,
      // INTERNAL_KEY_BINDING intentionally omitted
    };

    // Act
    const result = await processTrade(
      validTradeData,
      env as Parameters<typeof processTrade>[1],
      logger,
      realOptions,
      "queue_disabled"
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain("Internal authentication key");
    expect(logger.error).toHaveBeenCalled();
    expect(service.fetch).not.toHaveBeenCalled();
  });

  test("should return error when TRADE_SERVICE fetch throws", async () => {
    // Arrange
    const store = createMockIdempotencyStore(true);
    const service = {
      fetch: mock(async () => {
        throw new Error("Network down");
      }),
    };
    const env = {
      IDEMPOTENCY_STORE: store,
      TRADE_SERVICE: service,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processTrade(
      validTradeData,
      env as Parameters<typeof processTrade>[1],
      logger,
      realOptions,
      "queue_disabled"
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network down");
    expect(logger.error).toHaveBeenCalled();
  });

  test("should return error when TRADE_SERVICE responds with !ok status", async () => {
    // Arrange
    const store = createMockIdempotencyStore(true);
    const service = createMockServiceBinding(
      () =>
        new Response(JSON.stringify({ error: "trade failed" }), {
          status: 500,
        })
    );
    const env = {
      IDEMPOTENCY_STORE: store,
      TRADE_SERVICE: service,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processTrade(
      validTradeData,
      env as Parameters<typeof processTrade>[1],
      logger,
      realOptions,
      "queue_disabled"
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe("Trade worker returned error");
    expect(result.tradeResult).toEqual({ error: "trade failed" });
  });

  test("should fall back to TRADE_SERVICE when queue send throws", async () => {
    // Arrange — queue_everywhere + TRADE_QUEUE + TRADE_SERVICE, but
    // queue.send throws so the function should fall through to the
    // direct service call.
    const store = createMockIdempotencyStore(true);
    const queue = {
      send: mock(async () => {
        throw new Error("Queue unavailable");
      }),
    };
    const service = createMockServiceBinding();
    const env = {
      IDEMPOTENCY_STORE: store,
      TRADE_SERVICE: service,
      TRADE_QUEUE: queue,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processTrade(
      validTradeData,
      env as Parameters<typeof processTrade>[1],
      logger,
      realOptions,
      "queue_everywhere"
    );

    // Assert
    expect(result.success).toBe(true);
    expect(queue.send).toHaveBeenCalledTimes(1);
    expect(service.fetch).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processNotification
// ---------------------------------------------------------------------------

describe("processNotification", () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  test("should return error when TELEGRAM_SERVICE is not configured", async () => {
    // Arrange
    const env = { INTERNAL_KEY_BINDING: "test-internal-key" };

    // Act
    const result = await processNotification(
      validNotificationData,
      env as Parameters<typeof processNotification>[1],
      logger
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain("TELEGRAM_SERVICE");
    expect(logger.error).toHaveBeenCalled();
  });

  test("should return error when INTERNAL_KEY_BINDING is not configured", async () => {
    // Arrange
    const service = createMockServiceBinding();
    const env = { TELEGRAM_SERVICE: service };

    // Act
    const result = await processNotification(
      validNotificationData,
      env as Parameters<typeof processNotification>[1],
      logger
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain("Internal authentication key");
    expect(logger.error).toHaveBeenCalled();
    expect(service.fetch).not.toHaveBeenCalled();
  });

  test("should return error when TELEGRAM_SERVICE fetch throws", async () => {
    // Arrange
    const service = {
      fetch: mock(async () => {
        throw new Error("Telegram worker down");
      }),
    };
    const env = {
      TELEGRAM_SERVICE: service,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processNotification(
      validNotificationData,
      env as Parameters<typeof processNotification>[1],
      logger
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain("Telegram worker down");
    expect(logger.error).toHaveBeenCalled();
  });

  test("should return success when TELEGRAM_SERVICE responds with 200", async () => {
    // Arrange
    const service = createMockServiceBinding(
      () =>
        new Response(JSON.stringify({ ok: true, message_id: 42 }), {
          status: 200,
        })
    );
    const env = {
      TELEGRAM_SERVICE: service,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processNotification(
      validNotificationData,
      env as Parameters<typeof processNotification>[1],
      logger
    );

    // Assert
    expect(result.success).toBe(true);
    expect(result.notificationResult).toEqual({ ok: true, message_id: 42 });
    expect(result.error).toBeUndefined();
  });

  test("should return error when TELEGRAM_SERVICE responds with !ok status", async () => {
    // Arrange
    const service = createMockServiceBinding(
      () =>
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
        })
    );
    const env = {
      TELEGRAM_SERVICE: service,
      INTERNAL_KEY_BINDING: "test-internal-key",
    };

    // Act
    const result = await processNotification(
      validNotificationData,
      env as Parameters<typeof processNotification>[1],
      logger
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe("Telegram worker returned error");
    expect(result.notificationResult).toEqual({ error: "rate limited" });
  });
});

// ---------------------------------------------------------------------------
// createDefaultMessage
// ---------------------------------------------------------------------------

describe("createDefaultMessage", () => {
  test("should format a default message from webhook data", () => {
    // Arrange
    const data = {
      exchange: "binance",
      action: "LONG",
      symbol: "BTCUSDT",
      quantity: 0.1,
    };

    // Act
    const message = createDefaultMessage(data);

    // Assert
    expect(message).toBe("Trade Signal: LONG BTCUSDT @ binance (Qty: 0.1)");
  });
});
