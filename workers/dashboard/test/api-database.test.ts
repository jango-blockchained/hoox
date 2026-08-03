/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";

// Mock the `server-only` import used by lib/api.ts indirectly
mock.module("server-only", () => ({}));

const originalEnv = { ...process.env };

interface QueryResponse {
  success: boolean;
  results?: Record<string, unknown>[];
  error?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("lib/api.ts — Database Explorer helpers", () => {
  let api: typeof import("../src/lib/api").api;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.D1_WORKER_URL = "https://d1-worker.test";
    global.fetch = mock(async () =>
      Promise.resolve(
        jsonResponse({ success: true, results: [] } as QueryResponse)
      )
    ) as unknown as typeof fetch;
    // Re-import to get a fresh module instance
    const mod = await import(`../src/lib/api?bust=${Date.now()}`);
    api = mod.api;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getDatabaseTables", () => {
    it("returns the static catalog of D1 tables", () => {
      const { tables } = api.getDatabaseTables();
      expect(tables.length).toBe(4);
      const ids = tables.map((t) => t.id);
      expect(ids).toEqual(["signals", "positions", "trades", "agent_logs"]);
    });

    it("every entry exposes id, label, d1Name, description", () => {
      const { tables } = api.getDatabaseTables();
      for (const t of tables) {
        expect(typeof t.id).toBe("string");
        expect(t.id.length).toBeGreaterThan(0);
        expect(typeof t.label).toBe("string");
        expect(t.label.length).toBeGreaterThan(0);
        expect(typeof t.d1Name).toBe("string");
        expect(t.d1Name.length).toBeGreaterThan(0);
        expect(typeof t.description).toBe("string");
      }
    });

    it("the signals entry maps to trade_signals", () => {
      const { tables } = api.getDatabaseTables();
      const signals = tables.find((t) => t.id === "signals");
      expect(signals?.d1Name).toBe("trade_signals");
    });

    it("the agent_logs entry maps to system_logs", () => {
      const { tables } = api.getDatabaseTables();
      const agent = tables.find((t) => t.id === "agent_logs");
      expect(agent?.d1Name).toBe("system_logs");
    });
  });

  describe("queryTable", () => {
    it("rejects tables outside the allowlist via Zod validation", async () => {
      await expect(api.queryTable("not_a_real_table", 20)).rejects.toThrow();
    });

    it("issues two parallel requests (count + rows) to d1-worker /query", async () => {
      api.setInternalKey("test-internal-key");
      const calls: Array<{ url: string; body: string }> = [];
      global.fetch = mock(async (url, init) => {
        const body = init?.body ? String(init.body) : "";
        calls.push({ url: String(url), body });
        return Promise.resolve(
          jsonResponse({ success: true, results: [{ count: 42 }] })
        );
      }) as unknown as typeof fetch;

      await api.queryTable("positions", 25);

      expect(calls.length).toBe(2);
      const bodies = calls.map((c) => JSON.parse(c.body));
      const queries = bodies.map((b) => b.query);
      expect(
        queries.some(
          (q: string) =>
            q.includes("SELECT COUNT(*)") && q.includes("FROM positions")
        )
      ).toBe(true);
      expect(
        queries.some(
          (q: string) =>
            q.includes("SELECT *") &&
            q.includes("FROM positions") &&
            q.includes("LIMIT ?")
        )
      ).toBe(true);
      const limits = bodies
        .map((b) => b.params)
        .filter((p) => Array.isArray(p))
        .flat();
      expect(limits).toContain(25);
    });

    it("attaches the X-Internal-Auth-Key header when set", async () => {
      api.setInternalKey("the-secret-key");
      let sawAuth = false;
      global.fetch = mock(async (_url, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (headers["X-Internal-Auth-Key"] === "the-secret-key") {
          sawAuth = true;
        }
        return Promise.resolve(
          jsonResponse({ success: true, results: [{ count: 0 }] })
        );
      }) as unknown as typeof fetch;

      await api.queryTable("trades", 10);
      expect(sawAuth).toBe(true);
    });

    it("returns the parsed count and rows on success", async () => {
      api.setInternalKey("test-internal-key");
      let callIdx = 0;
      global.fetch = mock(async () => {
        callIdx += 1;
        if (callIdx === 1) {
          return Promise.resolve(
            jsonResponse({ success: true, results: [{ count: 17 }] })
          );
        }
        return Promise.resolve(
          jsonResponse({
            success: true,
            results: [{ id: 1, symbol: "BTC/USDT" }],
          })
        );
      }) as unknown as typeof fetch;

      const result = await api.queryTable("trades", 10);
      expect(result.count).toBe(17);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.["symbol"]).toBe("BTC/USDT");
    });

    it("throws a descriptive error when the count query fails", async () => {
      api.setInternalKey("test-internal-key");
      global.fetch = mock(async () =>
        Promise.resolve(
          jsonResponse({ success: false, error: "Unauthorized" }, 401)
        )
      ) as unknown as typeof fetch;

      await expect(api.queryTable("trades", 10)).rejects.toThrow(
        /Unauthorized/i
      );
    });

    it("clamps the limit to a safe positive integer", async () => {
      api.setInternalKey("test-internal-key");
      const seenLimits: number[] = [];
      let callIdx = 0;
      global.fetch = mock(async (_url, init) => {
        callIdx += 1;
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (Array.isArray(body.params)) {
          seenLimits.push(body.params[0]);
        }
        return Promise.resolve(
          jsonResponse({ success: true, results: [{ count: 0 }] })
        );
      }) as unknown as typeof fetch;

      await api.queryTable("trades", -5);
      expect(callIdx).toBeGreaterThan(0);
      // Negative limit clamps to 1
      for (const l of seenLimits) {
        expect(l).toBeGreaterThan(0);
        expect(l).toBeLessThanOrEqual(1000);
      }
    });
  });
});
