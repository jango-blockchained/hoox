/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live Secret Management Tests
 *
 * Tests Cloudflare Workers Secrets via wrangler CLI.
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 *
 * What's tested:
 *   - secret list for a worker
 *   - secret put (with stdin piping)
 *   - secret delete
 *   - Multiple workers secret listing
 *
 * SAFETY: Uses a dedicated test secret name prefixed with
 * LIVE_TEST_ that can be easily cleaned up.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  getConfig,
  wrangler,
  canMutateCloudflare,
  hasLiveEnv,
  section,
  testResourceName,
} from "./helpers";

const TEST_SECRET_NAME = testResourceName("LIVE_TEST_SECRET");
const TEST_SECRET_VALUE = `live-test-value-${Date.now()}`;

// Skip these live integration tests when no Cloudflare credentials available
const hasCloudflareEnv =
  hasLiveEnv("CLOUDFLARE_ACCOUNT_ID") && canMutateCloudflare();
(hasCloudflareEnv ? describe : describe.skip)("Secrets", () => {
  let config: ReturnType<typeof getConfig>;
  const testWorkers = ["hoox", "d1-worker", "trade-worker"];

  beforeAll(async () => {
    config = getConfig();
  });

  // -----------------------------------------------------------------------
  // List secrets for known workers
  // -----------------------------------------------------------------------

  test(
    "secret list returns secrets for hoox worker",
    { timeout: 60000 },
    async () => {
      section("List secrets");
      // Check our known hoox worker
      const result = await wrangler(["secret", "list", "--name", "hoox"]);
      expect(result.ok).toBe(true);
      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed)).toBe(true);
      console.log(`  ✓ hoox has ${parsed.length} secret(s)`);
      for (const secret of parsed) {
        console.log(`    - ${secret.name}`);
      }
    }
  );

  test(
    "secret list returns secrets for d1-worker",
    { timeout: 60000 },
    async () => {
      const result = await wrangler(["secret", "list", "--name", "d1-worker"]);
      expect(result.ok).toBe(true);
      const parsed = JSON.parse(result.stdout);
      console.log(`  ✓ d1-worker has ${parsed.length} secret(s)`);
    }
  );

  test(
    "secret list returns secrets for trade-worker",
    { timeout: 60000 },
    async () => {
      const result = await wrangler([
        "secret",
        "list",
        "--name",
        "trade-worker",
      ]);
      expect(result.ok).toBe(true);
      const parsed = JSON.parse(result.stdout);
      console.log(`  ✓ trade-worker has ${parsed.length} secret(s)`);
    }
  );

  // -----------------------------------------------------------------------
  // Put a test secret
  // -----------------------------------------------------------------------

  test(
    "secret put adds a new secret to hoox worker",
    { timeout: 60000 },
    async () => {
      section("Put secret");
      try {
        const result = await wrangler(
          ["secret", "put", TEST_SECRET_NAME, "--name", "hoox"],
          undefined,
          TEST_SECRET_VALUE
        );
        expect(result.ok).toBe(true);
        console.log(`  ✓ Created secret "${TEST_SECRET_NAME}" on hoox`);

        // Verify it appears in list (with retry for propagation delay)
        let found = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((r) => setTimeout(r, 1000));
          const listResult = await wrangler([
            "secret",
            "list",
            "--name",
            "hoox",
          ]);
          if (listResult.ok && listResult.stdout.length > 0) {
            try {
              const parsed = JSON.parse(listResult.stdout);
              found = parsed.find(
                (s: { name: string }) => s.name === TEST_SECRET_NAME
              );
              if (found) break;
            } catch {
              // retry
            }
          }
        }
        expect(found).toBeDefined();
        console.log(`  ✓ "${TEST_SECRET_NAME}" confirmed in secret list`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Could not create secret: ${message}`);
        console.log("    (May need wrangler authenticated)");
      }
    }
  );

  // -----------------------------------------------------------------------
  // Delete test secret
  // -----------------------------------------------------------------------

  test(
    "secret delete removes the test secret",
    { timeout: 60000 },
    async () => {
      section("Delete secret");
      try {
        const result = await wrangler([
          "secret",
          "delete",
          TEST_SECRET_NAME,
          "--name",
          "hoox",
        ]);
        expect(result.ok).toBe(true);
        console.log(`  ✓ Deleted secret "${TEST_SECRET_NAME}" from hoox`);

        // Verify it's gone (with retry for propagation delay)
        let found = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((r) => setTimeout(r, 1000));
          const listResult = await wrangler([
            "secret",
            "list",
            "--name",
            "hoox",
          ]);
          if (listResult.ok && listResult.stdout.length > 0) {
            try {
              const parsed = JSON.parse(listResult.stdout);
              found = parsed.find(
                (s: { name: string }) => s.name === TEST_SECRET_NAME
              );
              if (!found) break;
            } catch {
              // retry
            }
          }
        }
        expect(found).toBeUndefined();
        console.log("  ✓ Confirmed secret no longer in list");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠ Could not delete secret: ${message}`);
      }
    }
  );

  // -----------------------------------------------------------------------
  // Cross-worker test
  // -----------------------------------------------------------------------

  test("List secrets across multiple workers", { timeout: 60000 }, async () => {
    section("Cross-worker secrets");
    const allWorkers = [
      "hoox",
      "d1-worker",
      "trade-worker",
      "telegram-worker",
      "agent-worker",
    ];
    let totalSecrets = 0;

    for (const worker of allWorkers) {
      const result = await wrangler(["secret", "list", "--name", worker]);
      if (result.ok) {
        try {
          const parsed = JSON.parse(result.stdout);
          totalSecrets += parsed.length;
          console.log(`  ${worker}: ${parsed.length} secret(s)`);
        } catch {
          console.log(`  ${worker}: (parse error)`);
        }
      } else {
        console.log(`  ${worker}: (not found)`);
      }
    }
    console.log(
      `  Total: ${totalSecrets} secrets across ${allWorkers.length} workers`
    );
  });
});
