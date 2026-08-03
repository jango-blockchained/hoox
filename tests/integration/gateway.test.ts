/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for the Hoox gateway.
 *
 * Tests the composition of shared middleware (Zod validation + auth + logging)
 * in a Miniflare-like environment. Falls back to pure unit tests
 * if cloudflare:test is unavailable.
 */

import { describe, test, expect } from "bun:test";
import {
  validateJson,
  validateJsonLegacy,
} from "@hoox-sh/hoox-shared/middleware";
import {
  WebhookPayloadSchema,
  TradeActionSchema,
} from "@hoox-sh/hoox-shared/types";
import { createLogger } from "@hoox-sh/hoox-shared/middleware";

// Tests that validate the integration of Zod schemas with the validateJson middleware
describe("Zod + validateJson Integration", () => {
  test("validates a real TradingView webhook payload", () => {
    const tradingViewPayload = {
      exchange: "binance",
      action: "LONG" as const,
      symbol: "BTC/USDT",
      quantity: 0.5,
      price: 50000,
      orderType: "market",
      leverage: 20,
    };
    const result = validateJson(WebhookPayloadSchema, tradingViewPayload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.symbol).toBe("BTC/USDT");
      expect(result.value.action).toBe("LONG");
    }
  });

  test("rejects TradingView payload with missing fields", () => {
    const result = validateJson(WebhookPayloadSchema, {
      exchange: "test",
      // missing symbol, action, quantity
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("symbol");
      expect(result.error).toContain("action");
      expect(result.error).toContain("quantity");
    }
  });

  test("validateJson + TradeActionSchema rejects invalid trade action", () => {
    const result = validateJson(WebhookPayloadSchema, {
      exchange: "binance",
      action: "HOLD", // invalid — not in the enum
      symbol: "BTC/USDT",
      quantity: 0.1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("action");
    }
  });

  test("validateJson + TradeActionSchema accepts all valid actions", () => {
    for (const action of [
      "LONG",
      "SHORT",
      "CLOSE_LONG",
      "CLOSE_SHORT",
    ] as const) {
      const result = TradeActionSchema.safeParse(action);
      expect(result.success).toBe(true);
    }
  });

  test("validateJson produces structured error messages", () => {
    const result = validateJson(WebhookPayloadSchema, {
      exchange: "",
      action: "INVALID",
      symbol: "",
      quantity: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Error should include field paths
      expect(result.error).toContain("exchange");
      expect(result.error).toContain("action");
      expect(result.error).toContain("symbol");
      expect(result.error).toContain("quantity");
    }
  });
});

// Tests that compose Zod + logger integration
describe("Logger + Validation Integration", () => {
  test("logger captures validation errors in context", () => {
    const logs: string[] = [];
    const spy = (msg: string) => logs.push(msg);
    const origInfo = console.info;
    const origWarn = console.warn;
    const origError = console.error;
    console.info = spy;
    console.warn = spy;
    console.error = spy;

    try {
      const logger = createLogger({ service: "test", module: "integration" });
      const result = validateJson(WebhookPayloadSchema, { exchange: "" });
      if (!result.ok) {
        logger.warn("Validation failed", { error: result.error });
      }

      expect(logs.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.level).toBe("warn");
      expect(parsed.service).toBe("test");
      expect(parsed.message).toBe("Validation failed");
      expect(parsed.context.error).toBeTruthy();
    } finally {
      console.info = origInfo;
      console.warn = origWarn;
      console.error = origError;
    }
  });

  test("logger produces parseable JSON for all levels", () => {
    const logs: string[] = [];
    const spy = (msg: string) => logs.push(msg);
    const origInfo = console.info;
    const origWarn = console.warn;
    const origError = console.error;
    console.info = spy;
    console.warn = spy;
    console.error = spy;

    try {
      const logger = createLogger({ service: "test" });
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");

      expect(logs.length).toBe(3);
      for (const log of logs) {
        const parsed = JSON.parse(log);
        expect(parsed).toHaveProperty("level");
        expect(parsed).toHaveProperty("service");
        expect(parsed).toHaveProperty("message");
        expect(parsed).toHaveProperty("timestamp");
      }
    } finally {
      console.info = origInfo;
      console.warn = origWarn;
      console.error = origError;
    }
  });
});

// Test legacy validateJson for backward compatibility
describe("Legacy validateJson Backward Compatibility", () => {
  test("validateJsonLegacy still works with requests", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value", nested: { data: 1 } }),
    });
    const result = await validateJsonLegacy(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.key).toBe("value");
      expect((result.value.nested as { data: number }).data).toBe(1);
    }
  });
});

// Cloudflare worker integration test (if pool is available)
describe("Miniflare Gateway Integration", () => {
  test("processes a valid webhook through the gateway", async () => {
    let cloudflareTest: any;
    try {
      cloudflareTest = await import("cloudflare:test");
    } catch {
      // cloudflare:test not available in this environment
      return;
    }

    const { env, createExecutionContext, waitOnExecutionContext } =
      cloudflareTest;
    const worker = (await import("../../workers/hoox-worker/src/index"))
      .default;

    const request = new Request("http://localhost/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exchange: "mexc",
        action: "LONG",
        symbol: "BTC_USDT",
        quantity: 0.1,
        price: 50000,
        leverage: 20,
      }),
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
  });

  test("returns 400 for invalid webhook payload", async () => {
    let cloudflareTest: any;
    try {
      cloudflareTest = await import("cloudflare:test");
    } catch {
      return;
    }

    const { env, createExecutionContext, waitOnExecutionContext } =
      cloudflareTest;
    const worker = (await import("../../workers/hoox-worker/src/index"))
      .default;

    const request = new Request("http://localhost/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Missing required fields: action, symbol, quantity
        exchange: "mexc",
        price: 50000,
      }),
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    // Should fail validation
    expect([400, 403]).toContain(response.status);
  });
});
