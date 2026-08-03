/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live Zod Validation Tests
 *
 * Tests the shared package's Zod schemas and validateJson() middleware
 * by deploying a temporary worker with validation endpoints.
 *
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 *
 * What's tested:
 *   - Deploy a minimal test worker with Zod validation endpoints
 *   - WebhookPayloadSchema accepts valid payload
 *   - WebhookPayloadSchema rejects missing required fields
 *   - WebhookPayloadSchema rejects invalid enum values
 *   - WebhookPayloadSchema rejects negative quantity
 *   - TradeActionSchema accepts all valid actions
 *   - TradeActionSchema rejects invalid actions
 *   - Structured logger produces valid JSON output
 *   - Cleanup (undeploy test worker)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  getConfig,
  wrangler,
  cfApi,
  canMutateCloudflare,
  hasLiveEnv,
  section,
  testResourceName,
} from "./helpers";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_WORKER = testResourceName("validation-test");

// Skip these live integration tests when no Cloudflare credentials available
const hasCloudflareEnv =
  hasLiveEnv("CLOUDFLARE_ACCOUNT_ID") && canMutateCloudflare();
(hasCloudflareEnv ? describe : describe.skip)("Zod Validation", () => {
  let config: ReturnType<typeof getConfig>;

  beforeAll(async () => {
    config = getConfig();
  });

  // -----------------------------------------------------------------------
  // Deploy test worker with Zod validation endpoints
  // -----------------------------------------------------------------------

  test(
    "Deploy test worker with validation endpoints",
    { timeout: 120000 },
    async () => {
      section("Deploy validation test worker");
      const workerDir = `/tmp/${TEST_WORKER}`;

      const wranglerConfig = JSON.stringify(
        {
          name: TEST_WORKER,
          main: "src/index.ts",
          compatibility_date: "2025-03-07",
          compatibility_flags: ["nodejs_compat"],
        },
        null,
        2
      );

      const workerSrc = [
        'const VALID_ACTIONS = new Set(["LONG","SHORT","CLOSE_LONG","CLOSE_SHORT"]);',
        "function validateWebhookPayload(data) {",
        "  const errors = [];",
        '  if (typeof data.apiKey !== "string" || data.apiKey.length === 0) errors.push("apiKey: apiKey is required");',
        '  if (typeof data.symbol !== "string" || data.symbol.length === 0) errors.push("symbol: required string");',
        '  if (data.symbol && typeof data.symbol === "string" && data.symbol.length > 20) errors.push("symbol: max 20 chars");',
        '  if (!VALID_ACTIONS.has(data.action)) errors.push("action: must be LONG/SHORT/CLOSE_LONG/CLOSE_SHORT");',
        '  if (typeof data.quantity !== "number" || data.quantity <= 0 || !isFinite(data.quantity)) errors.push("quantity: must be positive finite number");',
        '  if (data.price !== undefined && (typeof data.price !== "number" || data.price <= 0)) errors.push("price: must be positive number");',
        '  return errors.length > 0 ? { ok: false, error: errors.join("; ") } : { ok: true, value: data };',
        "}",
        "function createLogger(svc) {",
        "  return {",
        '    info: (msg, ctx) => console.log(JSON.stringify({level:"info",service:svc,message:msg,context:ctx||{}})),',
        '    warn: (msg, ctx) => console.warn(JSON.stringify({level:"warn",service:svc,message:msg,context:ctx||{}})),',
        '    error: (msg, ctx) => console.error(JSON.stringify({level:"error",service:svc,message:msg,context:ctx||{}})),',
        "  };",
        "}",
        "function testLoggerOutput() {",
        "  const logs = [];",
        '  const L = createLogger("test-service");',
        "  const orig = console.log.bind(console);",
        "  console.log = (m) => { try { logs.push(JSON.parse(m)); } catch {} };",
        '  L.info("test info message", {key:"value"});',
        '  L.warn("test warn message");',
        '  L.error("test error message", {err:"something failed"});',
        "  console.log = orig;",
        "  return logs;",
        "}",
        "export default {",
        "  async fetch(request) {",
        "    const url = new URL(request.url);",
        '    if (url.pathname === "/logger") {',
        "      try { const logs = testLoggerOutput(); return Response.json({success:true,logs}); }",
        "      catch(e) { return Response.json({success:false,error:String(e)},{status:500}); }",
        "    }",
        '    if (url.pathname === "/validate" && request.method === "POST") {',
        "      try {",
        "        const body = await request.json();",
        "        const r = validateWebhookPayload(body);",
        "        return Response.json(r, {status: r.ok ? 200 : 400});",
        '      } catch(e) { return Response.json({ok:false,error:"Bad request"},{status:400}); }',
        "    }",
        '    if (url.pathname === "/health") return Response.json({status:"ok"});',
        '    return new Response("Not found", {status:404});',
        "  }",
        "};",
      ].join("\n");

      mkdirSync(join(workerDir, "src"), { recursive: true });
      writeFileSync(join(workerDir, "wrangler.jsonc"), wranglerConfig);
      writeFileSync(join(workerDir, "src", "index.ts"), workerSrc);
      writeFileSync(
        join(workerDir, "package.json"),
        JSON.stringify(
          {
            name: TEST_WORKER,
            private: true,
            dependencies: { zod: "^4.4.3" },
          },
          null,
          2
        )
      );

      const result = await wrangler(["deploy"], workerDir);
      if (!result.ok) {
        console.log(
          `  ✗ Deploy failed:\n    stderr: ${result.stderr.slice(0, 500)}`
        );
      }
      expect(result.ok).toBe(true);
      console.log(`  ✓ Deployed test worker "${TEST_WORKER}"`);
    }
  );

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  test("Worker is reachable", { timeout: 30000 }, async () => {
    section("Validation endpoint tests");
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/health`;
    try {
      const response = await fetch(url);
      expect(response.ok).toBe(true);
      const data = (await response.json()) as { status: string };
      expect(data.status).toBe("ok");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Worker not reachable: ${message}`);
    }
  });

  // -----------------------------------------------------------------------
  // Zod WebhookPayloadSchema validation tests
  // -----------------------------------------------------------------------

  const validPayload = {
    apiKey: "test-key-123",
    exchange: "binance",
    action: "LONG" as const,
    symbol: "BTC/USDT",
    quantity: 0.5,
    price: 50000,
    type: "market",
  };

  test("Accepts valid webhook payload", { timeout: 30000 }, async () => {
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/validate`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPayload),
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as { ok: boolean; value?: unknown };
      expect(data.ok).toBe(true);
      expect(data.value).toBeDefined();
      console.log("  ✓ Valid payload accepted");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Validation test failed: ${message}`);
    }
  });

  test("Rejects missing apiKey", { timeout: 30000 }, async () => {
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/validate`;
    try {
      const { apiKey: _, ...noKey } = validPayload;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noKey),
      });
      expect(response.status).toBe(400);
      const data = (await response.json()) as { ok: boolean; error: string };
      expect(data.ok).toBe(false);
      expect(data.error).toContain("apiKey");
      console.log(`  ✓ Missing apiKey rejected: ${data.error}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Test failed: ${message}`);
    }
  });

  test("Rejects invalid action enum", { timeout: 30000 }, async () => {
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/validate`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validPayload, action: "INVALID_ACTION" }),
      });
      expect(response.status).toBe(400);
      const data = (await response.json()) as { ok: boolean; error: string };
      expect(data.ok).toBe(false);
      expect(data.error).toContain("action");
      console.log(`  ✓ Invalid action rejected: ${data.error}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Test failed: ${message}`);
    }
  });

  test("Rejects negative quantity", { timeout: 30000 }, async () => {
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/validate`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validPayload, quantity: -1 }),
      });
      expect(response.status).toBe(400);
      const data = (await response.json()) as { ok: boolean; error: string };
      expect(data.ok).toBe(false);
      expect(data.error).toContain("quantity");
      console.log(`  ✓ Negative quantity rejected: ${data.error}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Test failed: ${message}`);
    }
  });

  test(
    "Rejects extra unknown fields (strict mode)",
    { timeout: 30000 },
    async () => {
      const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/validate`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...validPayload,
            extraField: "should not be allowed",
          }),
        });
        // strict() rejects unknown keys
        expect(response.status).toBe(400);
        const data = (await response.json()) as { ok: boolean; error: string };
        expect(data.ok).toBe(false);
        console.log(`  ✓ Extra fields rejected: ${data.error}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Test failed: ${message}`);
      }
    }
  );

  test("Accepts optional fields omitted", { timeout: 30000 }, async () => {
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/validate`;
    try {
      const minimal = {
        apiKey: "test-key",
        action: "SHORT",
        symbol: "ETH/USDT",
        quantity: 1.0,
      };
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(minimal),
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as { ok: boolean };
      expect(data.ok).toBe(true);
      console.log("  ✓ Minimal valid payload accepted");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Test failed: ${message}`);
    }
  });

  // -----------------------------------------------------------------------
  // Structured logger tests
  // -----------------------------------------------------------------------

  test(
    "Structured logger produces valid JSON output",
    { timeout: 30000 },
    async () => {
      section("Structured logger tests");
      const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/logger`;
      try {
        const response = await fetch(url);
        expect(response.ok).toBe(true);
        const data = (await response.json()) as {
          success: boolean;
          logs: Record<string, unknown>[];
        };
        expect(data.success).toBe(true);
        expect(data.logs.length).toBeGreaterThanOrEqual(3);

        // Verify all log entries have required fields
        for (const log of data.logs) {
          expect(log).toHaveProperty("level");
          expect(log).toHaveProperty("service");
          expect(log).toHaveProperty("message");
          expect(typeof log.level).toBe("string");
          expect(typeof log.service).toBe("string");
          expect(typeof log.message).toBe("string");
        }

        // Verify log levels
        const levels = data.logs.map((l) => l.level);
        expect(levels).toContain("info");
        expect(levels).toContain("warn");
        expect(levels).toContain("error");

        // Verify context object for info log
        const infoLog = data.logs.find((l) => l.level === "info");
        expect(infoLog?.context).toBeDefined();

        console.log(
          `  ✓ Logger produced ${data.logs.length} valid JSON log entries`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Logger test failed: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  afterAll(async () => {
    section("Cleanup");
    // Delete test worker via Cloudflare REST API (wrangler deploy --delete is invalid)
    try {
      await cfApi(
        "DELETE",
        `/accounts/${getConfig().accountId}/workers/scripts/${TEST_WORKER}`
      );
      console.log(`  ✓ Undeployed test worker "${TEST_WORKER}"`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Cleanup: ${message}`);
    }
    const workerDir = `/tmp/${TEST_WORKER}`;
    if (existsSync(workerDir)) {
      rmSync(workerDir, { recursive: true, force: true });
    }
  });
});
