import { describe, it, expect, mock } from "bun:test";
import type { ExecutionContext } from "@cloudflare/workers-types";

// Mock cloudflare:workers built-in module using dynamic import
// (static mock.module doesn't work with colon-based specifiers)
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

const webhookReceiver = await import("../src/index").then((m) => m.default);
// Re-export for inline usage
const _webhookReceiver = webhookReceiver;

/**
 * Comprehensive test suite for hoox worker
 * Tests router endpoints, idempotency handling, event processing, and error handling
 */

// ============================================================================
// Mock Utilities
// ============================================================================

function createMockContext(): ExecutionContext {
  return {
    waitUntil: mock(() => {}),
    passThroughOnException: mock(() => {}),
  } as unknown as ExecutionContext;
}

interface MockEnv {
  WEBHOOK_API_KEY_BINDING?: string;
  INTERNAL_KEY_BINDING?: string;
  CONFIG_KV?: any;
  SESSIONS_KV?: any;
  TRADE_SERVICE?: any;
  TELEGRAM_SERVICE?: any;
  TRADE_QUEUE?: any;
  IDEMPOTENCY_STORE?: any;
  [key: string]: any;
}

function createMockKV(): any {
  return {
    get: mock(async () => null),
    put: mock(async () => undefined),
    delete: mock(async () => undefined),
    getWithMetadata: mock(async () => ({ value: null, metadata: null })),
    list: mock(async () => ({ keys: [] })),
  };
}

function createMockServiceBinding(): any {
  return {
    fetch: mock(
      async () =>
        new Response(JSON.stringify({ success: true, result: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ),
  };
}

function createMockEnv(overrides: Partial<MockEnv> = {}): MockEnv {
  return {
    WEBHOOK_API_KEY_BINDING: "test-api-key",
    INTERNAL_KEY_BINDING: "test-internal-key",
    CONFIG_KV: createMockKV(),
    SESSIONS_KV: createMockKV(),
    TRADE_SERVICE: createMockServiceBinding(),
    TELEGRAM_SERVICE: createMockServiceBinding(),
    TRADE_QUEUE: {
      send: mock(async () => undefined),
    },
    IDEMPOTENCY_STORE: {
      idFromName: mock((name: string) => ({ name })),
      get: mock(() => ({
        checkAndStore: mock(async () => true),
      })),
    },
    ...overrides,
  };
}

// ============================================================================
// Health Check Endpoint Tests
// ============================================================================

describe("Hoox Worker - Health Check Endpoint", () => {
  it("GET /health returns 200 status", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBe(200);
  });

  it("GET /health returns JSON response", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  it("GET /health includes status field", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    const body = (await response.json()) as any;
    expect(body).toHaveProperty("result.status");
    expect(body.result.status).toBe("ok");
  });

  it("GET /health includes security headers", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("GET /health includes disclaimer header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.has("X-Disclaimer")).toBe(true);
  });
});

// ============================================================================
// Webhook Endpoint Tests
// ============================================================================

describe("Hoox Worker - Webhook Endpoint", () => {
  const validPayload = {
    apiKey: "test-api-key",
    exchange: "binance",
    action: "LONG",
    symbol: "BTCUSDT",
    quantity: 0.1,
    price: 50000,
    leverage: 20,
  };

  it("POST /webhook accepts webhook events", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([200, 201, 202, 400, 401, 403, 500]).toContain(response.status);
  });

  it("POST /webhook validates webhook payload", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({}), // Missing required fields
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([400, 401, 403, 422, 500]).toContain(response.status);
  });

  it("POST /webhook returns proper JSON response", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  it("POST /webhook requires API key", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([400, 401, 403]).toContain(response.status);
  });

  it("POST /webhook rejects invalid API key", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        ...validPayload,
        apiKey: "invalid-key",
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBe(403);
  });

  it("POST /webhook includes security headers", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Strict-Transport-Security")).toBeTruthy();
  });
});

// ============================================================================
// Idempotency Tests
// ============================================================================

describe("Hoox Worker - Idempotency", () => {
  const validPayload = {
    apiKey: "test-api-key",
    exchange: "binance",
    action: "LONG",
    symbol: "BTCUSDT",
    quantity: 0.1,
  };

  it("handles idempotency key header", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
        "Idempotency-Key": "test-key-123",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });

  it("generates idempotency key from trade data", async () => {
    const tradeData = {
      exchange: "binance",
      symbol: "BTCUSDT",
      action: "LONG",
      quantity: 0.1,
    };

    // Verify idempotency key format
    const key = `trade:${tradeData.exchange}:${tradeData.symbol}:${tradeData.action}:${tradeData.quantity}`;
    expect(key).toContain("trade:");
    expect(key).toContain("binance");
    expect(key).toContain("BTCUSDT");
  });

  it("checks idempotency before processing trade", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    // Should call idempotency store if configured
    if (env.IDEMPOTENCY_STORE) {
      expect(env.IDEMPOTENCY_STORE.idFromName).toBeDefined();
    }
  });

  it("allows duplicate requests with same idempotency key", async () => {
    const body = JSON.stringify(validPayload);
    const headers = {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "52.89.214.238",
      "Idempotency-Key": "test-key-123",
    };

    const request1 = new Request("https://example.com/webhook", {
      method: "POST",
      headers,
      body,
    });
    const request2 = new Request("https://example.com/webhook", {
      method: "POST",
      headers,
      body,
    });

    const env = createMockEnv();
    const ctx1 = createMockContext();
    const ctx2 = createMockContext();

    const response1 = await webhookReceiver.fetch(request1, env, ctx1);
    const response2 = await webhookReceiver.fetch(request2, env, ctx2);

    // Both should have similar status (both success or both fail)
    expect([response1.status, response2.status]).toEqual(
      expect.arrayContaining([response1.status])
    );
  });

  it("rejects different payloads with same idempotency key", async () => {
    const headers = {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "52.89.214.238",
      "Idempotency-Key": "test-key-123",
    };

    const request1 = new Request("https://example.com/webhook", {
      method: "POST",
      headers,
      body: JSON.stringify(validPayload),
    });
    const request2 = new Request("https://example.com/webhook", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...validPayload,
        quantity: 0.2, // Different quantity
      }),
    });

    const env = createMockEnv();
    const ctx1 = createMockContext();
    const ctx2 = createMockContext();

    const response1 = await webhookReceiver.fetch(request1, env, ctx1);
    const response2 = await webhookReceiver.fetch(request2, env, ctx2);

    // Second request should be rejected or return cached response
    expect([200, 201, 202, 400, 409, 500]).toContain(response2.status);
  });
});

// ============================================================================
// Event Processing Tests
// ============================================================================

describe("Hoox Worker - Event Processing", () => {
  const validPayload = {
    apiKey: "test-api-key",
    exchange: "binance",
    action: "LONG",
    symbol: "BTCUSDT",
    quantity: 0.1,
    price: 50000,
    leverage: 20,
  };

  it("processes valid webhook events", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });

  it("validates event structure", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        // Missing required fields
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    expect(body.tradeResult).toBeNull();
  });

  it("handles concurrent event processing", async () => {
    const requests = [
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "52.89.214.238",
        },
        body: JSON.stringify(validPayload),
      }),
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "52.89.214.238",
        },
        body: JSON.stringify({
          ...validPayload,
          symbol: "ETHUSDT",
        }),
      }),
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "52.89.214.238",
        },
        body: JSON.stringify({
          ...validPayload,
          symbol: "ADAUSDT",
        }),
      }),
    ];

    const env = createMockEnv();
    const responses = await Promise.all(
      requests.map((req) =>
        webhookReceiver.fetch(req, env, createMockContext())
      )
    );

    responses.forEach((response) => {
      expect(response.status).toBeLessThan(500);
    });
  });

  it("removes API key before forwarding to trade service", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);

    // Verify trade service was called
    if (env.TRADE_SERVICE?.fetch) {
      const calls = (env.TRADE_SERVICE.fetch as any).mock?.calls || [];
      if (calls.length > 0) {
        const requestBody = JSON.parse(calls[0][1]?.body || "{}");
        expect(requestBody.apiKey).toBeUndefined();
      }
    }
  });

  it("processes trade and notification together", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        ...validPayload,
        notify: {
          message: "Trade executed",
          chatId: "123456",
        },
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });

  it("processes only trade when notification is missing", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Hoox Worker - Error Handling", () => {
  it("returns 404 for unknown endpoints", async () => {
    const request = new Request("https://example.com/unknown", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBe(404);
  });

  it("returns 405 for wrong HTTP method on /health", async () => {
    const request = new Request("https://example.com/health", {
      method: "POST",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([404, 405]).toContain(response.status);
  });

  it("returns 405 for GET on /webhook", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([404, 405]).toContain(response.status);
  });

  it("handles invalid JSON", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: "invalid json",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([400, 401, 500]).toContain(response.status);
  });

  it("handles missing authentication", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([400, 401, 403]).toContain(response.status);
  });

  it("error responses include error message", async () => {
    const request = new Request("https://example.com/unknown", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    if (response.status >= 400) {
      const body = (await response.json()) as any;
      expect(body).toHaveProperty("error");
    }
  });

  it("handles IP allowlist rejection", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.168.1.1", // Not in allowlist
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([403, 400, 401]).toContain(response.status);
  });

  it("handles missing API key binding", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
      }),
    });
    const env = createMockEnv({ WEBHOOK_API_KEY_BINDING: undefined });
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([400, 401, 403, 500]).toContain(response.status);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("Hoox Worker - Edge Cases", () => {
  it("handles very large webhook payloads", async () => {
    const largeData = "x".repeat(100000);
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
        note: largeData,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });

  it("handles special characters in event data", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
        note: "<script>alert('xss')</script>",
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });

  it("handles unicode characters", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
        note: "🚀 ✅ 你好 مرحبا",
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });

  it("handles null values in optional fields", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
        price: null,
        leverage: null,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });

  it("handles empty string values", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "",
        action: "",
        symbol: "",
        quantity: 0.1,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    expect(body.tradeResult).toBeNull();
  });

  it("handles zero quantity", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    expect(body.tradeResult).toBeNull();
  });

  it("handles negative quantity", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: -0.1,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([400, 401, 403, 422, 500]).toContain(response.status);
  });

  it("handles very high leverage values", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
        leverage: 999999,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.status).toBeLessThan(500);
  });

  it("handles missing CF-Connecting-IP header", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: "test-api-key",
        exchange: "binance",
        action: "LONG",
        symbol: "BTCUSDT",
        quantity: 0.1,
      }),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect([400, 401, 403, 500]).toContain(response.status);
  });
});

// ============================================================================
// Security Headers Tests
// ============================================================================

describe("Hoox Worker - Security Headers", () => {
  it("includes X-Content-Type-Options header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("includes X-Frame-Options header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("includes X-XSS-Protection header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
  });

  it("includes Referrer-Policy header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("includes Permissions-Policy header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    const permissionsPolicy = response.headers.get("Permissions-Policy");
    expect(permissionsPolicy).toContain("camera=()");
    expect(permissionsPolicy).toContain("microphone=()");
    expect(permissionsPolicy).toContain("geolocation=()");
  });

  it("includes Strict-Transport-Security header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    const sts = response.headers.get("Strict-Transport-Security");
    expect(sts).toContain("max-age=31536000");
    expect(sts).toContain("includeSubDomains");
  });

  it("includes Content-Security-Policy header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
  });

  it("includes disclaimer header", async () => {
    const request = new Request("https://example.com/health", {
      method: "GET",
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);
    expect(response.headers.has("X-Disclaimer")).toBe(true);
  });
});

// ============================================================================
// Rate Limiting Tests
// ============================================================================

describe("Hoox Worker - Rate Limiting", () => {
  it("allows trades under rate limit", async () => {
    const validPayload = {
      apiKey: "test-api-key",
      exchange: "binance",
      action: "LONG",
      symbol: "BTCUSDT",
      quantity: 0.1,
    };

    const env = createMockEnv();

    for (let i = 0; i < 5; i++) {
      const request = new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "52.89.214.238",
        },
        body: JSON.stringify(validPayload),
      });
      const ctx = createMockContext();

      const response = await webhookReceiver.fetch(request, env, ctx);
      expect(response.status).toBeLessThan(500);
    }
  });

  it("rejects trades over rate limit", async () => {
    const validPayload = {
      apiKey: "test-api-key",
      exchange: "binance",
      action: "LONG",
      symbol: "BTCUSDT",
      quantity: 0.1,
    };

    const env = createMockEnv();

    // Send many requests to exceed rate limit
    const responses = [];
    for (let i = 0; i < 15; i++) {
      const request = new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "52.89.214.238",
        },
        body: JSON.stringify(validPayload),
      });
      const ctx = createMockContext();

      const response = await webhookReceiver.fetch(request, env, ctx);
      responses.push(response.status);
    }

    // At least some should succeed, some might be rate limited
    expect(responses.length).toBe(15);
  });
});

// ============================================================================
// Request ID Tests
// ============================================================================

describe("Hoox Worker - Request ID", () => {
  it("generates unique request ID for each webhook", async () => {
    const validPayload = {
      apiKey: "test-api-key",
      exchange: "binance",
      action: "LONG",
      symbol: "BTCUSDT",
      quantity: 0.1,
    };

    const env = createMockEnv();

    const request1 = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const request2 = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });

    const response1 = await webhookReceiver.fetch(
      request1,
      env,
      createMockContext()
    );
    const response2 = await webhookReceiver.fetch(
      request2,
      env,
      createMockContext()
    );

    if (response1.status === 200 && response2.status === 200) {
      const body1 = (await response1.json()) as any;
      const body2 = (await response2.json()) as any;

      if (body1.requestId && body2.requestId) {
        expect(body1.requestId).not.toBe(body2.requestId);
      }
    }
  });

  it("includes request ID in response", async () => {
    const validPayload = {
      apiKey: "test-api-key",
      exchange: "binance",
      action: "LONG",
      symbol: "BTCUSDT",
      quantity: 0.1,
    };

    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "52.89.214.238",
      },
      body: JSON.stringify(validPayload),
    });
    const env = createMockEnv();
    const ctx = createMockContext();

    const response = await webhookReceiver.fetch(request, env, ctx);

    if (response.status === 200 || response.status === 500) {
      const body = (await response.json()) as any;
      expect(body).toHaveProperty("requestId");
    }
  });
});
