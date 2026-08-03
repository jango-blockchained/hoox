/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, expect, test } from "bun:test";

const originalEnv = { ...process.env };

describe("dashboard config", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("uses fallback when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;

    const mod = await import("../src/lib/config");
    expect(mod).toBeDefined();
  });

  test("allows AUTH_TYPE=none in development", async () => {
    process.env.AUTH_TYPE = "none";
    const env = process.env as Record<string, string | undefined>;
    const prevNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "development";

    try {
      const { assertProductionAuthConfigured } =
        await import("../src/lib/config");
      expect(() => assertProductionAuthConfigured()).not.toThrow();
    } finally {
      env.NODE_ENV = prevNodeEnv;
    }
  });

  test("resolves scoped internal auth keys with dashboard aliases", async () => {
    process.env.D1_INTERNAL_KEY = "d1-read-alias";
    process.env.TRADE_INTERNAL_KEY = "trade-exec-alias";
    process.env.TELEGRAM_INTERNAL_KEY = "telegram-alias";

    const { getInternalAuthKeys } = await import("../src/lib/config");
    const keys = getInternalAuthKeys();
    expect(keys.d1Read).toBe("d1-read-alias");
    expect(keys.tradeExecute).toBe("trade-exec-alias");
    expect(keys.telegram).toBe("telegram-alias");
  });

  test("rejects AUTH_TYPE=none in production", async () => {
    process.env.AUTH_TYPE = "none";
    const env = process.env as Record<string, string | undefined>;
    const prevNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";

    try {
      const { assertProductionAuthConfigured } =
        await import("../src/lib/config");
      expect(() => assertProductionAuthConfigured()).toThrow(/not permitted/);
    } finally {
      env.NODE_ENV = prevNodeEnv;
    }
  });
});
