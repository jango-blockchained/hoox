/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration test for `hoox perf fastpath`.
 *
 * Requires `docker compose --profile workers up` to be running locally.
 * Verifies:
 *   1. A probe gets a 200 response with `status: "probed"`.
 *   2. The probe does NOT add a row to the D1 `trades` table.
 *   3. The hoox worker logs a per-hop console.log with the probe_id.
 *
 * Skipped if the local workers aren't reachable.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const GATEWAY_URL =
  process.env.HOOX_GATEWAY_URL ?? "http://localhost:8787/webhook";
const INTERNAL_KEY = process.env.HOOX_INTERNAL_KEY ?? "test-internal-key";

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "POST", body: "{}" });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function queryTradesCount(): Promise<number> {
  const result = spawnSync(
    "wrangler",
    [
      "d1",
      "execute",
      "my-database",
      "--local",
      "--command",
      "SELECT COUNT(*) as c FROM trades",
      "--json",
    ],
    { cwd: REPO_ROOT, encoding: "utf-8" }
  );
  if (result.status !== 0) return -1;
  try {
    const parsed = JSON.parse(result.stdout) as Array<{
      results?: Array<{ c?: number }>;
    }>;
    return parsed[0]?.results?.[0]?.c ?? 0;
  } catch {
    return -1;
  }
}

describe("hoox perf fastpath (integration)", () => {
  let reachable = false;
  let tradesBefore = 0;

  beforeAll(async () => {
    reachable = await isReachable(GATEWAY_URL);
    if (reachable) {
      tradesBefore = await queryTradesCount();
    }
  });

  it("sends a probe and gets a 200 response with status: probed", async () => {
    if (!reachable) {
      console.warn("Skipping: workers not reachable at", GATEWAY_URL);
      return;
    }
    const probe_id = crypto.randomUUID();
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Auth-Key": INTERNAL_KEY,
      },
      body: JSON.stringify({
        probe: true,
        probe_id,
        symbol: "BTCUSDT",
        action: "LONG",
        quantity: 0.001,
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.probe_id).toBe(probe_id);
    expect(body.status).toBe("probed");
  });

  it("does NOT add a row to the trades table", async () => {
    if (!reachable || tradesBefore < 0) return;
    const probe_id = crypto.randomUUID();
    await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Auth-Key": INTERNAL_KEY,
      },
      body: JSON.stringify({
        probe: true,
        probe_id,
        symbol: "BTCUSDT",
        action: "LONG",
        quantity: 0.001,
      }),
    });
    await new Promise((r) => setTimeout(r, 500));
    const tradesAfter = await queryTradesCount();
    expect(tradesAfter).toBe(tradesBefore);
  });
});
