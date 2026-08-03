/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for shared Zod schemas
 * Run with: bun test packages/shared/test/schemas.test.ts
 */

import { describe, test, expect } from "bun:test";
import {
  TradeActionSchema,
  WebhookPayloadSchema,
  TradeQueueMessageSchema,
  TradeSignalSchema,
  PositionSchema,
  BalanceSchema,
} from "../src/types";
import {
  TradeRecordSchema,
  PositionRecordSchema,
  BalanceRecordSchema,
  SystemLogRecordSchema,
  TradeSignalRecordSchema,
} from "../src/d1/schemas";

describe("TradeActionSchema", () => {
  test("accepts valid actions", () => {
    expect(TradeActionSchema.parse("LONG")).toBe("LONG");
    expect(TradeActionSchema.parse("SHORT")).toBe("SHORT");
    expect(TradeActionSchema.parse("CLOSE_LONG")).toBe("CLOSE_LONG");
    expect(TradeActionSchema.parse("CLOSE_SHORT")).toBe("CLOSE_SHORT");
  });

  test("rejects invalid action", () => {
    const result = TradeActionSchema.safeParse("INVALID");
    expect(result.success).toBe(false);
  });

  test("rejects empty string", () => {
    const result = TradeActionSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

describe("WebhookPayloadSchema", () => {
  const validPayload = {
    exchange: "binance",
    action: "LONG",
    symbol: "BTC/USDT",
    quantity: 0.5,
    price: 50000,
    orderType: "market",
  };

  test("accepts valid payload", () => {
    const result = WebhookPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  test("rejects missing exchange", () => {
    const { exchange, ...rest } = validPayload;
    const result = WebhookPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("rejects invalid action enum", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      action: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative quantity", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects zero quantity", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects NaN quantity", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      quantity: NaN,
    });
    expect(result.success).toBe(false);
  });

  test("rejects extra unknown fields (strict mode)", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      extraField: "not_allowed",
    });
    expect(result.success).toBe(false);
  });

  test("accepts optional fields omitted", () => {
    const minimal = {
      exchange: "bybit",
      action: "SHORT",
      symbol: "ETH/USDT",
      quantity: 1.0,
    };
    const result = WebhookPayloadSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  test("accepts test: true for testnet trading", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      test: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.test).toBe(true);
    }
  });

  test("accepts test: false", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      test: false,
    });
    expect(result.success).toBe(true);
  });

  test("rejects non-boolean test", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      test: "yes",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty symbol", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      symbol: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects symbol over 20 chars", () => {
    const result = WebhookPayloadSchema.safeParse({
      ...validPayload,
      symbol: "A".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-object input", () => {
    expect(WebhookPayloadSchema.safeParse("string").success).toBe(false);
    expect(WebhookPayloadSchema.safeParse(123).success).toBe(false);
    expect(WebhookPayloadSchema.safeParse(null).success).toBe(false);
    expect(WebhookPayloadSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("TradeQueueMessageSchema", () => {
  const validMessage = {
    requestId: "req-1",
    exchange: "binance",
    action: "LONG",
    symbol: "BTCUSDT",
    quantity: 0.01,
    queuedAt: new Date().toISOString(),
  };

  test("accepts valid queue message", () => {
    expect(TradeQueueMessageSchema.safeParse(validMessage).success).toBe(true);
  });

  test("accepts optional test flag", () => {
    const result = TradeQueueMessageSchema.safeParse({
      ...validMessage,
      test: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.test).toBe(true);
    }
  });

  test("rejects invalid action", () => {
    const result = TradeQueueMessageSchema.safeParse({
      ...validMessage,
      action: "BUY",
    });
    expect(result.success).toBe(false);
  });

  test("rejects extra fields (strict)", () => {
    const result = TradeQueueMessageSchema.safeParse({
      ...validMessage,
      probe: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("TradeSignalSchema", () => {
  const validSignal = {
    source: "tradingview",
    symbol: "BTC/USDT",
    action: "LONG",
    price: 50000,
    quantity: 0.5,
  };

  test("accepts valid signal", () => {
    const result = TradeSignalSchema.safeParse(validSignal);
    expect(result.success).toBe(true);
  });

  test("accepts signal with optional id", () => {
    const result = TradeSignalSchema.safeParse({
      ...validSignal,
      id: 1,
      status: "pending",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing source", () => {
    const { source, ...rest } = validSignal;
    const result = TradeSignalSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("rejects missing quantity", () => {
    const { quantity, ...rest } = validSignal;
    const result = TradeSignalSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("rejects extra unknown fields (strict mode)", () => {
    const result = TradeSignalSchema.safeParse({
      ...validSignal,
      unknownField: "nope",
    });
    expect(result.success).toBe(false);
  });
});

describe("PositionSchema", () => {
  const validPosition = {
    id: "pos-1",
    symbol: "BTC/USDT",
    side: "LONG",
    quantity: 1.0,
    entry_price: 50000,
    current_price: 51000,
    unrealized_pnl: 1000,
    timestamp: 1715000000,
  };

  test("accepts valid position", () => {
    const result = PositionSchema.safeParse(validPosition);
    expect(result.success).toBe(true);
  });

  test("rejects invalid side", () => {
    const result = PositionSchema.safeParse({
      ...validPosition,
      side: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative entry_price", () => {
    const result = PositionSchema.safeParse({
      ...validPosition,
      entry_price: -1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid timestamp", () => {
    const result = PositionSchema.safeParse({
      ...validPosition,
      timestamp: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("BalanceSchema", () => {
  test("accepts valid balance", () => {
    const result = BalanceSchema.safeParse({
      asset: "BTC",
      free: 1.5,
      locked: 0.5,
      timestamp: 1715000000,
    });
    expect(result.success).toBe(true);
  });

  test("rejects negative free", () => {
    const result = BalanceSchema.safeParse({
      asset: "BTC",
      free: -1,
      locked: 0,
      timestamp: 1715000000,
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative locked", () => {
    const result = BalanceSchema.safeParse({
      asset: "BTC",
      free: 1,
      locked: -0.1,
      timestamp: 1715000000,
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty asset", () => {
    const result = BalanceSchema.safeParse({
      asset: "",
      free: 1,
      locked: 0,
      timestamp: 1715000000,
    });
    expect(result.success).toBe(false);
  });
});

describe("D1 Record Schemas", () => {
  test("TradeRecordSchema accepts valid record", () => {
    const result = TradeRecordSchema.safeParse({
      id: "t1",
      timestamp: 1715000000,
      exchange: "binance",
      symbol: "BTC/USDT",
      action: "LONG",
      quantity: 0.5,
      price: 50000,
      leverage: 10,
      status: "executed",
    });
    expect(result.success).toBe(true);
  });

  test("TradeRecordSchema accepts nullable fields as null", () => {
    const result = TradeRecordSchema.safeParse({
      id: "t2",
      timestamp: 1715000000,
      exchange: "binance",
      symbol: "BTC/USDT",
      action: "LONG",
      quantity: null,
      price: null,
      leverage: null,
      status: "pending",
    });
    expect(result.success).toBe(true);
  });

  test("TradeRecordSchema rejects missing id", () => {
    const result = TradeRecordSchema.safeParse({
      timestamp: 1715000000,
      exchange: "binance",
      symbol: "BTC/USDT",
      action: "LONG",
      quantity: 0.5,
      price: 50000,
      leverage: 10,
      status: "executed",
    });
    expect(result.success).toBe(false);
  });

  test("TradeRecordSchema rejects extra fields (strict mode)", () => {
    const result = TradeRecordSchema.safeParse({
      id: "t3",
      timestamp: 1715000000,
      exchange: "binance",
      symbol: "BTC/USDT",
      action: "LONG",
      quantity: 0.5,
      price: 50000,
      leverage: 10,
      status: "executed",
      extraField: "not_allowed",
    });
    expect(result.success).toBe(false);
  });

  test("PositionRecordSchema accepts valid record", () => {
    const result = PositionRecordSchema.safeParse({
      id: "p1",
      exchange: "binance",
      symbol: "BTC/USDT",
      side: "LONG",
      size: 1.0,
      status: "OPEN",
      updated_at: 1715000000,
    });
    expect(result.success).toBe(true);
  });

  test("PositionRecordSchema accepts CLOSED status", () => {
    const result = PositionRecordSchema.safeParse({
      id: "p2",
      exchange: "bybit",
      symbol: "ETH/USDT",
      side: "SHORT",
      size: 2.0,
      status: "CLOSED",
      updated_at: 1715000001,
    });
    expect(result.success).toBe(true);
  });

  test("PositionRecordSchema rejects invalid side enum", () => {
    const result = PositionRecordSchema.safeParse({
      id: "p3",
      exchange: "binance",
      symbol: "BTC/USDT",
      side: "INVALID",
      size: 1.0,
      status: "OPEN",
      updated_at: 1715000000,
    });
    expect(result.success).toBe(false);
  });

  test("PositionRecordSchema rejects invalid status enum", () => {
    const result = PositionRecordSchema.safeParse({
      id: "p4",
      exchange: "binance",
      symbol: "BTC/USDT",
      side: "LONG",
      size: 1.0,
      status: "UNKNOWN",
      updated_at: 1715000000,
    });
    expect(result.success).toBe(false);
  });

  test("BalanceRecordSchema accepts valid record", () => {
    const result = BalanceRecordSchema.safeParse({
      id: "b1",
      exchange: "binance",
      asset: "BTC",
      free: 1.5,
      used: 0.5,
      total: 2.0,
      timestamp: 1715000000,
    });
    expect(result.success).toBe(true);
  });

  test("BalanceRecordSchema accepts nullable fields as null", () => {
    const result = BalanceRecordSchema.safeParse({
      id: "b2",
      exchange: "binance",
      asset: "ETH",
      free: null,
      used: null,
      total: null,
      timestamp: 1715000000,
    });
    expect(result.success).toBe(true);
  });

  test("BalanceRecordSchema rejects missing timestamp", () => {
    const result = BalanceRecordSchema.safeParse({
      id: "b3",
      exchange: "binance",
      asset: "BTC",
      free: 1.0,
      used: 0.0,
      total: 1.0,
    });
    expect(result.success).toBe(false);
  });

  test("SystemLogRecordSchema accepts valid record", () => {
    const result = SystemLogRecordSchema.safeParse({
      id: "log1",
      level: "info",
      service: "hoox",
      message: "startup",
    });
    expect(result.success).toBe(true);
  });

  test("SystemLogRecordSchema accepts all optional fields", () => {
    const result = SystemLogRecordSchema.safeParse({
      id: "log2",
      timestamp: 1715000000,
      level: "error",
      service: "trade-worker",
      message: "connection lost",
      details: '{"reason":"timeout"}',
    });
    expect(result.success).toBe(true);
  });

  test("SystemLogRecordSchema rejects missing id", () => {
    const result = SystemLogRecordSchema.safeParse({
      level: "info",
      service: "hoox",
      message: "test",
    });
    expect(result.success).toBe(false);
  });

  test("SystemLogRecordSchema rejects empty message", () => {
    const result = SystemLogRecordSchema.safeParse({
      id: "log3",
      level: "info",
      service: "hoox",
      message: "",
    });
    expect(result.success).toBe(false);
  });

  test("TradeSignalRecordSchema accepts valid record", () => {
    const result = TradeSignalRecordSchema.safeParse({
      signal_id: "sig-1",
      timestamp: 1715000000,
      symbol: "BTC/USDT",
      signal_type: "LONG",
    });
    expect(result.success).toBe(true);
  });

  test("TradeSignalRecordSchema accepts optional fields", () => {
    const result = TradeSignalRecordSchema.safeParse({
      signal_id: "sig-2",
      timestamp: 1715000000,
      symbol: "ETH/USDT",
      signal_type: "SHORT",
      source: "tradingview",
      raw_data: '{"price":3000}',
      processed_at: 1715000001,
    });
    expect(result.success).toBe(true);
  });

  test("TradeSignalRecordSchema rejects missing signal_id", () => {
    const result = TradeSignalRecordSchema.safeParse({
      timestamp: 1715000000,
      symbol: "BTC/USDT",
      signal_type: "LONG",
    });
    expect(result.success).toBe(false);
  });

  test("TradeSignalRecordSchema rejects missing symbol", () => {
    const result = TradeSignalRecordSchema.safeParse({
      signal_id: "sig-3",
      timestamp: 1715000000,
      signal_type: "LONG",
    });
    expect(result.success).toBe(false);
  });
});
