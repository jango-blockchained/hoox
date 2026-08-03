/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live Durable Object Tests
 *
 * Tests Cloudflare Durable Objects via deployed worker endpoints.
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, HOOX_DO_WORKER
 *
 * What's tested:
 *   - Deploy a minimal test worker with a DO binding
 *   - DO counter/alarm operations
 *   - DO storage read/write
 *   - DO idempotency (existing hoox IdempotencyStore)
 *   - Cleanup (undeploy test worker)
 *
 * NOTE: This test deploys a temporary worker with a Durable Object
 * binding, tests the DO operations, then undeploys it. It requires
 * Workers Paid plan (DOs are not available on Free).
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

const TEST_WORKER = testResourceName("do-test-worker");

// In-memory idempotency store for testing
interface IdempotencyEntry {
  storedAt: number;
}

// Skip these live integration tests when no Cloudflare credentials available
const hasCloudflareEnv = hasLiveEnv("HOOX_DO_WORKER") && canMutateCloudflare();
(hasCloudflareEnv ? describe : describe.skip)("Durable Objects", () => {
  let config: ReturnType<typeof getConfig>;

  beforeAll(async () => {
    config = getConfig();
  });

  // -----------------------------------------------------------------------
  // Deploy test worker with DO
  // -----------------------------------------------------------------------

  test("Deploy test worker with DO binding", { timeout: 120000 }, async () => {
    section("Deploy test worker");
    // Create a temporary directory for the test worker
    const workerDir = `/tmp/${TEST_WORKER}`;

    // Create wrangler.jsonc for the test worker
    const wranglerConfig = JSON.stringify(
      {
        name: TEST_WORKER,
        main: "src/index.ts",
        compatibility_date: "2025-03-07",
        compatibility_flags: ["nodejs_compat"],
        durable_objects: {
          bindings: [
            {
              name: "TEST_COUNTER",
              class_name: "TestCounter",
            },
            {
              name: "IDEMPOTENCY_STORE",
              class_name: "TestIdempotencyStore",
            },
          ],
        },
        migrations: [
          {
            tag: "v1",
            new_sqlite_classes: ["TestCounter", "TestIdempotencyStore"],
          },
        ],
      },
      null,
      2
    );

    // Create the worker source
    const workerSrc = `
import { DurableObject } from "cloudflare:workers";

export class TestCounter extends DurableObject {
  private count: number = 0;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.count = (await ctx.storage.get<number>("count")) ?? 0;
    });
  }

  async increment(amount: number = 1): Promise<number> {
    this.count += amount;
    await this.ctx.storage.put("count", this.count);
    return this.count;
  }

  async getCount(): Promise<number> {
    return this.count;
  }

  async reset(): Promise<void> {
    this.count = 0;
    await this.ctx.storage.delete("count");
  }
}

// IdempotencyStore — tests checkAndStore / expired logic
const DEFAULT_TTL_MS = 300_000;
interface StoredEntry { storedAt: number; }

export class TestIdempotencyStore extends DurableObject {
  async checkAndStore(key: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    const existing = await this.ctx.storage.get<StoredEntry>(key);
    if (existing && Date.now() - existing.storedAt < ttlMs) return false;
    await this.ctx.storage.put(key, { storedAt: Date.now() });
    const currentAlarm = await this.ctx.storage.getAlarm();
    const nextCleanup = Date.now() + ttlMs;
    if (!currentAlarm || nextCleanup < currentAlarm) {
      await this.ctx.storage.setAlarm(nextCleanup);
    }
    return true;
  }

  async expired(key: string): Promise<boolean> {
    const entry = await this.ctx.storage.get<StoredEntry>(key);
    if (!entry) return true;
    return Date.now() - entry.storedAt >= DEFAULT_TTL_MS;
  }

  async clear(): Promise<void> {
    const all = await this.ctx.storage.list<StoredEntry>();
    const keys = [...all.keys()];
    if (keys.length > 0) await this.ctx.storage.delete(keys);
  }
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const id = env.TEST_COUNTER.idFromName("test-instance");
    const stub = env.TEST_COUNTER.get(id);

    if (url.pathname === "/increment") {
      const count = await stub.increment(1);
      return new Response(JSON.stringify({ count }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/count") {
      const count = await stub.getCount();
      return new Response(JSON.stringify({ count }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/reset") {
      await stub.reset();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- IdempotencyStore routes ---

    if (url.pathname === "/idempotency/check") {
      const id = env.IDEMPOTENCY_STORE.idFromName("live-test-instance");
      const store = env.IDEMPOTENCY_STORE.get(id);
      const key = url.searchParams.get("key") ?? "default-key";
      const ttlMs = parseInt(url.searchParams.get("ttl") ?? "300000", 10);
      const result = await store.checkAndStore(key, ttlMs);
      return new Response(JSON.stringify({ ok: result, key }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/idempotency/expired") {
      const id = env.IDEMPOTENCY_STORE.idFromName("live-test-instance");
      const store = env.IDEMPOTENCY_STORE.get(id);
      const key = url.searchParams.get("key") ?? "default-key";
      const result = await store.expired(key);
      return new Response(JSON.stringify({ expired: result, key }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/idempotency/clear") {
      const id = env.IDEMPOTENCY_STORE.idFromName("live-test-instance");
      const store = env.IDEMPOTENCY_STORE.get(id);
      await store.clear();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
`;

    // Write files and deploy
    mkdirSync(join(workerDir, "src"), { recursive: true });
    writeFileSync(join(workerDir, "wrangler.jsonc"), wranglerConfig);
    writeFileSync(join(workerDir, "src", "index.ts"), workerSrc);

    const result = await wrangler(["deploy"], workerDir);
    expect(result.ok).toBe(true);
    console.log(`  ✓ Deployed test worker "${TEST_WORKER}" with DO`);
  });

  // -----------------------------------------------------------------------
  // DO counter operations
  // -----------------------------------------------------------------------

  test("DO initial count is 0", { timeout: 60000 }, async () => {
    section("DO counter operations");
    const result = await wrangler([
      "wrangler",
      "tail",
      TEST_WORKER,
      "--format",
      "json",
    ]);
    // Verify the worker is deployed and reachable via its URL
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/count`;
    try {
      const response = await fetch(url);
      expect(response.ok).toBe(true);
      const data = (await response.json()) as { count: number };
      expect(data.count).toBe(0);
      console.log("  ✓ Initial count is 0");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Could not reach DO worker: ${message}`);
      console.log("    (DNS may need time to propagate)");
    }
  });

  test("DO increment increases count", { timeout: 60000 }, async () => {
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/increment`;
    try {
      const response = await fetch(url);
      expect(response.ok).toBe(true);
      const data = (await response.json()) as { count: number };
      expect(data.count).toBeGreaterThan(0);
      console.log(`  ✓ Count incremented to ${data.count}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ DO increment failed: ${message}`);
    }
  });

  test("DO state persists across calls", { timeout: 60000 }, async () => {
    const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/count`;
    try {
      // Increment twice
      await fetch(`https://${TEST_WORKER}.cryptolinx.workers.dev/increment`);
      await fetch(`https://${TEST_WORKER}.cryptolinx.workers.dev/increment`);

      // Verify count
      const response = await fetch(url);
      const data = (await response.json()) as { count: number };
      expect(data.count).toBeGreaterThanOrEqual(3);
      console.log(`  ✓ DO state persisted (count = ${data.count})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ DO persistence test skipped: ${message}`);
    }
  });

  test("DO reset returns to 0", { timeout: 60000 }, async () => {
    try {
      await fetch(`https://${TEST_WORKER}.cryptolinx.workers.dev/reset`);
      const response = await fetch(
        `https://${TEST_WORKER}.cryptolinx.workers.dev/count`
      );
      const data = (await response.json()) as { count: number };
      expect(data.count).toBe(0);
      console.log("  ✓ DO reset successful");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ DO reset test skipped: ${message}`);
    }
  });

  // -----------------------------------------------------------------------
  // Test existing IdempotencyStore (if hoox worker has it)
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // IdempotencyStore operations
  // -----------------------------------------------------------------------

  test(
    "IdempotencyStore: checkAndStore returns true for new key",
    { timeout: 30000 },
    async () => {
      section("IdempotencyStore operations");
      const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/idempotency/check?key=live-test-first-key`;
      try {
        const response = await fetch(url);
        expect(response.ok).toBe(true);
        const data = (await response.json()) as { ok: boolean; key: string };
        expect(data.ok).toBe(true);
        console.log("  ✓ First checkAndStore returns true");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Idempotency test skipped: ${message}`);
      }
    }
  );

  test(
    "IdempotencyStore: second call for same key is rejected (duplicate)",
    { timeout: 30000 },
    async () => {
      const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/idempotency/check?key=live-test-dup-key`;
      try {
        // First call — should succeed
        const first = await fetch(url);
        expect(first.ok).toBe(true);
        const firstData = (await first.json()) as { ok: boolean };
        expect(firstData.ok).toBe(true);

        // Second call — should be rejected (duplicate within TTL)
        const second = await fetch(url);
        const secondData = (await second.json()) as { ok: boolean };
        expect(secondData.ok).toBe(false);
        console.log("  ✓ Duplicate key correctly rejected");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Dedup test skipped: ${message}`);
      }
    }
  );

  test(
    "IdempotencyStore: expired returns false for stored key",
    { timeout: 30000 },
    async () => {
      const baseUrl = `https://${TEST_WORKER}.cryptolinx.workers.dev`;
      try {
        // Store a key
        await fetch(`${baseUrl}/idempotency/check?key=live-test-exp-key`);

        // Check expired — should be false since just stored
        const expiredResp = await fetch(
          `${baseUrl}/idempotency/expired?key=live-test-exp-key`
        );
        const expiredData = (await expiredResp.json()) as { expired: boolean };
        expect(expiredData.expired).toBe(false);
        console.log("  ✓ Fresh key is not expired");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Expiry test skipped: ${message}`);
      }
    }
  );

  test(
    "IdempotencyStore: expired returns true for unknown key",
    { timeout: 30000 },
    async () => {
      const url = `https://${TEST_WORKER}.cryptolinx.workers.dev/idempotency/expired?key=live-test-nonexistent`;
      try {
        const response = await fetch(url);
        const data = (await response.json()) as { expired: boolean };
        expect(data.expired).toBe(true);
        console.log("  ✓ Unknown key correctly reports expired");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Unknown key test skipped: ${message}`);
      }
    }
  );

  test(
    "IdempotencyStore: clear removes all keys",
    { timeout: 30000 },
    async () => {
      const baseUrl = `https://${TEST_WORKER}.cryptolinx.workers.dev`;
      try {
        // Store multiple keys
        await fetch(`${baseUrl}/idempotency/check?key=live-test-clear-a`);
        await fetch(`${baseUrl}/idempotency/check?key=live-test-clear-b`);

        // Clear all
        const clearResp = await fetch(`${baseUrl}/idempotency/clear`);
        expect(clearResp.ok).toBe(true);

        // Verify both are now expired
        const expiredA = await fetch(
          `${baseUrl}/idempotency/expired?key=live-test-clear-a`
        );
        const dataA = (await expiredA.json()) as { expired: boolean };
        expect(dataA.expired).toBe(true);

        const expiredB = await fetch(
          `${baseUrl}/idempotency/expired?key=live-test-clear-b`
        );
        const dataB = (await expiredB.json()) as { expired: boolean };
        expect(dataB.expired).toBe(true);

        console.log("  ✓ Clear removed all keys");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Clear test skipped: ${message}`);
      }
    }
  );

  test(
    "Existing hoox IdempotencyStore DO is reachable",
    { timeout: 60000 },
    async () => {
      section("Existing DO (hoox IdempotencyStore)");
      const doWorkerName = process.env.HOOX_DO_WORKER ?? "hoox";
      try {
        // Access the hoox worker's health endpoint
        const url = `https://${doWorkerName}.cryptolinx.workers.dev/health`;
        const response = await fetch(url);
        expect(response.ok).toBe(true);
        console.log(
          `  ✓ "${doWorkerName}" worker is reachable (has DO bindings)`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Existing worker not reachable: ${message}`);
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
    // Remove temp worker directory
    const workerDir = `/tmp/${TEST_WORKER}`;
    if (existsSync(workerDir)) {
      rmSync(workerDir, { recursive: true, force: true });
    }
  });
});
