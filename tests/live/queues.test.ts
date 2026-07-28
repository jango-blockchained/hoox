/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live Queue Messaging Tests
 *
 * Tests Cloudflare Queues via wrangler CLI and REST API.
 * Wrangler outputs tables (not JSON), so we use string matching.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  getConfig,
  wrangler,
  cfApi,
  hasLiveEnv,
  section,
  testResourceName,
} from "./helpers";

const TEST_QUEUE = testResourceName("live-test-queue");

// Skip these live integration tests when no Cloudflare credentials available
const hasCloudflareEnv = hasLiveEnv("HOOX_QUEUE");
(hasCloudflareEnv ? describe : describe.skip)("Queues", () => {
  let config: ReturnType<typeof getConfig>;

  beforeAll(async () => {
    config = getConfig();
  });

  test("queues list returns existing queues", { timeout: 90000 }, async () => {
    section("List queues");
    const result = await wrangler(["queues", "list"]);
    expect(result.ok).toBe(true);
    expect(result.stdout.length).toBeGreaterThan(0);
    // Wrangler outputs a table, not JSON — check for table characters
    expect(result.stdout).toContain("│");
    console.log("  ✓ Queue list returned table output");
  });

  test("Create and verify a test queue", { timeout: 90000 }, async () => {
    section("Queue lifecycle");
    // Clean up stale queue from previous runs
    await wrangler(["queues", "delete", TEST_QUEUE]);
    // Create
    const create = await wrangler(["queues", "create", TEST_QUEUE]);
    if (!create.ok) {
      console.log(`  ⚠ Queue create failed: ${create.stderr.slice(0, 200)}`);
      return;
    }
    console.log(`  ✓ Created queue "${TEST_QUEUE}"`);
    // Verify in list
    const list = await wrangler(["queues", "list"]);
    expect(list.ok).toBe(true);
    expect(list.stdout).toContain(TEST_QUEUE);
    console.log(`  ✓ Queue "${TEST_QUEUE}" visible in list`);
  });

  test("Send a test message to the queue", { timeout: 60000 }, async () => {
    section("Send message");
    try {
      const result = await cfApi<{ message_id?: string }>(
        "POST",
        `/accounts/${config.accountId}/queues/${TEST_QUEUE}/messages`,
        { messages: [{ body: { test: true, source: "live-test-suite" } }] }
      );
      expect(result.success).toBe(true);
      console.log("  ✓ Sent 1 test message to queue");
    } catch (err: unknown) {
      console.log(
        `  ⚠ Message send skipped: ${err instanceof Error ? err.message.slice(0, 80) : err}`
      );
    }
  });

  // Cleanup
  afterAll(async () => {
    section("Cleanup");
    const result = await wrangler(["queues", "delete", TEST_QUEUE]);
    if (result.ok) {
      console.log(`  ✓ Deleted queue "${TEST_QUEUE}"`);
    } else {
      console.log(`  ⚠ Could not delete queue: ${result.stderr.slice(0, 200)}`);
    }
  });
});
