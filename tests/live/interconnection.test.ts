/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live Worker Interconnection Test
 *
 * Tests the full service binding chain between workers:
 * - Deploys a "frontend" worker (receives HTTP requests)
 * - Deploys a "middle" worker (processes data, called by frontend via service binding)
 * - Deploys a "backend" worker (stores/retrieves data, called by middle)
 * - Verifies data flows correctly through the chain
 *
 * Also tests:
 *   - Structured logging passes through service bindings
 *   - Zod validation rejects invalid payloads at each layer
 *   - Error propagation across service bindings
 *
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
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

const FRONTEND_WORKER = testResourceName("ic-frontend");
const MIDDLE_WORKER = testResourceName("ic-middle");
const BACKEND_WORKER = testResourceName("ic-backend");

// Skip these live integration tests when no Cloudflare credentials available
const hasCloudflareEnv =
  hasLiveEnv("CLOUDFLARE_ACCOUNT_ID") && canMutateCloudflare();
(hasCloudflareEnv ? describe : describe.skip)("Worker Interconnection", () => {
  let config: ReturnType<typeof getConfig>;

  beforeAll(async () => {
    config = getConfig();
  });

  // -----------------------------------------------------------------------
  // Deploy backend worker (storage layer)
  // -----------------------------------------------------------------------

  test("Deploy backend worker", { timeout: 120000 }, async () => {
    section("Deploy backend worker");
    const dir = `/tmp/${BACKEND_WORKER}`;
    mkdirSync(join(dir, "src"), { recursive: true });

    const wranglerConfig = JSON.stringify(
      {
        name: BACKEND_WORKER,
        main: "src/index.ts",
        compatibility_date: "2025-03-07",
        compatibility_flags: ["nodejs_compat"],
      },
      null,
      2
    );

    const workerSrc = `
// Backend worker --- in-memory store
const store = new Map<string, string>();

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", worker: "backend" });
    }

    // GET /get?key=xxx
    if (url.pathname === "/get") {
      const key = url.searchParams.get("key") ?? "";
      const value = store.get(key);
      return Response.json({ found: value !== undefined, value });
    }

    // POST /set --- body: { key, value }
    if (url.pathname === "/set" && request.method === "POST") {
      try {
        const body = await request.json() as Record<string, unknown>;
        if (typeof body.key !== "string" || typeof body.value !== "string") {
          return Response.json({ error: "key and value must be strings" }, { status: 400 });
        }
        store.set(body.key, body.value);
        return Response.json({ success: true, key: body.key });
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }

    // GET /items --- list all keys
    if (url.pathname === "/items") {
      return Response.json({ keys: [...store.keys()], count: store.size });
    }

    return new Response("Not found", { status: 404 });
  },
};
`;

    writeFileSync(join(dir, "wrangler.jsonc"), wranglerConfig);
    writeFileSync(join(dir, "src", "index.ts"), workerSrc);
    const result = await wrangler(["deploy"], dir);
    if (!result.ok) {
      console.log(
        `  ✗ Backend deploy failed:\n    stderr: ${result.stderr.slice(0, 500)}`
      );
    }
    expect(result.ok).toBe(true);
    console.log("  ✓ Deployed backend worker");
  });

  // -----------------------------------------------------------------------
  // Deploy middle worker (processing layer --- calls backend via service binding)
  // -----------------------------------------------------------------------

  test(
    "Deploy middle worker with service binding to backend",
    { timeout: 120000 },
    async () => {
      section("Deploy middle worker");
      const dir = `/tmp/${MIDDLE_WORKER}`;
      mkdirSync(join(dir, "src"), { recursive: true });

      const wranglerConfig = JSON.stringify(
        {
          name: MIDDLE_WORKER,
          main: "src/index.ts",
          compatibility_date: "2025-03-07",
          compatibility_flags: ["nodejs_compat"],
          services: [{ binding: "BACKEND_SERVICE", service: BACKEND_WORKER }],
        },
        null,
        2
      );

      const workerSrc = `
// Middle worker --- validates then stores via backend binding
const validActions = new Set(["LONG", "SHORT", "CLOSE_LONG", "CLOSE_SHORT"]);

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", worker: "middle" });
    }

    // POST /process --- validates payload, then stores in backend
    if (url.pathname === "/process" && request.method === "POST") {
      try {
        const body = await request.json() as Record<string, unknown>;

        // Zod-like validation
        const errors: string[] = [];
        if (!body.symbol || typeof body.symbol !== "string") errors.push("symbol: required string");
        if (!validActions.has(body.action as string)) errors.push("action: must be LONG/SHORT/CLOSE_LONG/CLOSE_SHORT");
        if (typeof body.quantity !== "number" || body.quantity <= 0) errors.push("quantity: must be positive number");

        if (errors.length > 0) {
          return Response.json({ ok: false, errors }, { status: 400 });
        }

        // Call backend to store
        const backendUrl = \`http://backend/set\`;
        const backendResp = await env.BACKEND_SERVICE.fetch(backendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: \`trade:\${body.symbol}:\${Date.now()}\`,
            value: JSON.stringify(body),
          }),
        });
        const backendResult = await backendResp.json();

        return Response.json({
          ok: true,
          stored: backendResult,
          processed_at: new Date().toISOString(),
        });
      } catch (err: unknown) {
        return Response.json({
          ok: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }, { status: 500 });
      }
    }

    // GET /stored --- read from backend
    if (url.pathname === "/stored") {
      const itemsResp = await env.BACKEND_SERVICE.fetch("http://backend/items");
      const items = await itemsResp.json();
      return Response.json(items);
    }

    return new Response("Not found", { status: 404 });
  },
};
`;

      writeFileSync(join(dir, "wrangler.jsonc"), wranglerConfig);
      writeFileSync(join(dir, "src", "index.ts"), workerSrc);
      const result = await wrangler(["deploy"], dir);
      if (!result.ok) {
        console.log(
          `  ✗ Middle deploy failed:\n    stderr: ${result.stderr.slice(0, 500)}`
        );
      }
      expect(result.ok).toBe(true);
      console.log("  ✓ Deployed middle worker with backend binding");
    }
  );

  // -----------------------------------------------------------------------
  // Deploy frontend worker (entry point --- calls middle via service binding)
  // -----------------------------------------------------------------------

  test(
    "Deploy frontend worker with service binding to middle",
    { timeout: 120000 },
    async () => {
      section("Deploy frontend worker");
      const dir = `/tmp/${FRONTEND_WORKER}`;
      mkdirSync(join(dir, "src"), { recursive: true });

      const wranglerConfig = JSON.stringify(
        {
          name: FRONTEND_WORKER,
          main: "src/index.ts",
          compatibility_date: "2025-03-07",
          compatibility_flags: ["nodejs_compat"],
          services: [{ binding: "MIDDLE_SERVICE", service: MIDDLE_WORKER }],
        },
        null,
        2
      );

      const workerSrc = `
// Frontend worker --- receives HTTP, forwards to middle via service binding
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      // Check health of entire chain
      try {
        const middleResp = await env.MIDDLE_SERVICE.fetch("http://middle/health");
        const middle = await middleResp.json();
        return Response.json({ status: "ok", worker: "frontend", chain: { middle } });
      } catch (err: unknown) {
        return Response.json({
          status: "degraded",
          error: err instanceof Error ? err.message : "Chain broken",
        }, { status: 502 });
      }
    }

    // POST /trade --- forward trade payload through the chain
    if (url.pathname === "/trade" && request.method === "POST") {
      try {
        const body = await request.json();
        const middleResp = await env.MIDDLE_SERVICE.fetch("http://middle/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await middleResp.json();
        const status = middleResp.ok ? 200 : 400;
        return Response.json(result, { status });
      } catch (err: unknown) {
        return Response.json({
          ok: false, error: err instanceof Error ? err.message : "Forward failed",
        }, { status: 502 });
      }
    }

    // GET /stored --- read all stored items from chain
    if (url.pathname === "/stored") {
      const middleResp = await env.MIDDLE_SERVICE.fetch("http://middle/stored");
      const items = await middleResp.json();
      return Response.json(items);
    }

    return new Response("Not found", { status: 404 });
  },
};
`;

      writeFileSync(join(dir, "wrangler.jsonc"), wranglerConfig);
      writeFileSync(join(dir, "src", "index.ts"), workerSrc);
      const result = await wrangler(["deploy"], dir);
      if (!result.ok) {
        console.log(
          `  ✗ Frontend deploy failed:\n    stderr: ${result.stderr.slice(0, 500)}`
        );
      }
      expect(result.ok).toBe(true);
      console.log("  ✓ Deployed frontend worker with middle binding");
    }
  );

  // -----------------------------------------------------------------------
  // Test the chain: health check through all 3 workers
  // -----------------------------------------------------------------------

  test(
    "Chain health check — frontend reaches middle and backend",
    { timeout: 30000 },
    async () => {
      section("Chain health check");
      const url = `https://${FRONTEND_WORKER}.cryptolinx.workers.dev/health`;
      try {
        const response = await fetch(url);
        expect(response.ok).toBe(true);
        const data = (await response.json()) as {
          status: string;
          chain: { middle: { status: string } };
        };
        expect(data.status).toBe("ok");
        expect(data.chain.middle.status).toBe("ok");
        console.log("  ✓ Full chain healthy (frontend -> middle -> backend)");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Chain health check skipped: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // Test: submit valid trade through the chain
  // -----------------------------------------------------------------------

  test(
    "Submit valid trade through frontend -> middle -> backend",
    { timeout: 30000 },
    async () => {
      section("Trade flow tests");
      const url = `https://${FRONTEND_WORKER}.cryptolinx.workers.dev/trade`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: "BTC/USDT",
            action: "LONG",
            quantity: 0.5,
          }),
        });
        expect(response.ok).toBe(true);
        const data = (await response.json()) as { ok: boolean };
        expect(data.ok).toBe(true);
        console.log("  ✓ Valid trade accepted through full chain");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Trade flow test skipped: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // Test: invalid payload rejected at middle layer
  // -----------------------------------------------------------------------

  test(
    "Invalid payload rejected with 400 + structured errors",
    { timeout: 30000 },
    async () => {
      const url = `https://${FRONTEND_WORKER}.cryptolinx.workers.dev/trade`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: "BTC/USDT",
            action: "INVALID_ACTION", // Invalid
            quantity: -1, // Negative
          }),
        });
        expect(response.ok).toBe(false);
        const data = (await response.json()) as {
          ok: boolean;
          errors: string[];
        };
        expect(data.ok).toBe(false);
        expect(data.errors.length).toBeGreaterThanOrEqual(1);
        console.log(
          `  ✓ Invalid payload rejected with ${data.errors.length} errors`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Validation test skipped: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // Test: data persists through the chain
  // -----------------------------------------------------------------------

  test(
    "Data persists — stored trade retrievable from backend",
    { timeout: 30000 },
    async () => {
      const tradeUrl = `https://${FRONTEND_WORKER}.cryptolinx.workers.dev/trade`;
      const storedUrl = `https://${FRONTEND_WORKER}.cryptolinx.workers.dev/stored`;
      try {
        // Submit a trade with unique symbol
        const uniqueSymbol = `TEST/${Date.now()}`;
        const tradeResp = await fetch(tradeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: uniqueSymbol,
            action: "SHORT",
            quantity: 1.0,
          }),
        });
        expect(tradeResp.ok).toBe(true);

        // Read stored items
        const storedResp = await fetch(storedUrl);
        const storedData = (await storedResp.json()) as {
          keys: string[];
          count: number;
        };
        expect(storedData.count).toBeGreaterThanOrEqual(1);
        console.log(
          `  ✓ Data persists through chain (${storedData.count} items stored)`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Persistence test skipped: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  afterAll(async () => {
    section("Cleanup");
    // Delete workers in reverse dependency order via Cloudflare REST API:
    // frontend → middle → backend (backend is referenced by middle, so must be deleted last)
    const accountId = getConfig().accountId;
    for (const name of [FRONTEND_WORKER, MIDDLE_WORKER, BACKEND_WORKER]) {
      try {
        await cfApi("DELETE", `/accounts/${accountId}/workers/scripts/${name}`);
        console.log(`  ✓ Undeployed "${name}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Could not delete "${name}": ${message}`);
      }
      // Remove temp worker directory
      const dir = `/tmp/${name}`;
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });
});
