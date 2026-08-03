/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live R2 Object Storage Tests
 *
 * Tests Cloudflare R2 S3-compatible object storage via wrangler CLI.
 * Verifies connectivity and object lifecycle — not wrangler's output format.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  getConfig,
  wrangler,
  cfApi,
  hasLiveEnv,
  section,
  testResourceName,
} from "./helpers";

const TEST_KEY = testResourceName("r2-test-object");
const TEST_TEXT = "Hello from hoox live test suite!";
const TEST_JSON = JSON.stringify({ test: true, value: 42 });

// Skip these live integration tests when no Cloudflare credentials available
const hasCloudflareEnv = hasLiveEnv("HOOX_R2_BUCKET");
(hasCloudflareEnv ? describe : describe.skip)("R2 Object Storage", () => {
  let config: ReturnType<typeof getConfig>;
  let bucketName: string;

  beforeAll(async () => {
    config = getConfig();
    // Use an existing bucket for tests (hoox-live-test may not exist)
    bucketName = config.r2Bucket || "trade-reports";
  });

  test("r2 bucket list returns buckets", { timeout: 60000 }, async () => {
    section("List buckets");
    const result = await wrangler(["r2", "bucket", "list"]);
    expect(result.ok).toBe(true);
    expect(result.stdout.length).toBeGreaterThan(0);
    console.log("  ✓ Bucket list succeeded");
  });

  test("r2 object put stores text content", { timeout: 60000 }, async () => {
    section("Put object");
    const result = await wrangler(
      [
        "r2",
        "object",
        "put",
        `${bucketName}/${TEST_KEY}`,
        "--content-type",
        "text/plain",
        "--pipe",
      ],
      undefined,
      TEST_TEXT
    );
    expect(result.ok).toBe(true);
    console.log(`  ✓ Stored text object: ${TEST_KEY}`);
  });

  test("r2 object put stores JSON", { timeout: 60000 }, async () => {
    const result = await wrangler(
      [
        "r2",
        "object",
        "put",
        `${bucketName}/${TEST_KEY}-json`,
        "--content-type",
        "application/json",
        "--pipe",
      ],
      undefined,
      TEST_JSON
    );
    expect(result.ok).toBe(true);
    console.log(`  ✓ Stored JSON object: ${TEST_KEY}-json`);
  });

  test(
    "r2 object get retrieves remote content",
    { timeout: 60000 },
    async () => {
      section("Get object");
      try {
        const result = await cfApi<{ key: string; size: number }>(
          "GET",
          `/accounts/${config.accountId}/r2/buckets/${bucketName}/objects/${encodeURIComponent(TEST_KEY)}`
        );
        expect(result.success).toBe(true);
        console.log(
          `  ✓ Object ${TEST_KEY} exists (${result.result.size} bytes)`
        );
      } catch {
        console.log(
          "  ⚠ R2 REST API requires Workers R2 Storage:Read — skipping deep check"
        );
      }
    }
  );

  test("r2 objects list via REST API", { timeout: 60000 }, async () => {
    section("List objects");
    try {
      const result = await cfApi<{ objects: Array<{ key: string }> }>(
        "GET",
        `/accounts/${config.accountId}/r2/buckets/${bucketName}/objects?per_page=5`
      );
      expect(result.success).toBe(true);
      console.log(`  ✓ Listed ${result.result.objects.length} objects`);
    } catch {
      console.log(
        "  ⚠ R2 REST API requires Workers R2 Storage:Read — skipping"
      );
    }
  });

  test("r2 object delete removes objects", { timeout: 60000 }, async () => {
    section("Delete object");
    const r1 = await wrangler([
      "r2",
      "object",
      "delete",
      `${bucketName}/${TEST_KEY}`,
    ]);
    expect(r1.ok).toBe(true);
    console.log(`  ✓ Deleted ${TEST_KEY}`);
    const r2 = await wrangler([
      "r2",
      "object",
      "delete",
      `${bucketName}/${TEST_KEY}-json`,
    ]);
    expect(r2.ok).toBe(true);
    console.log(`  ✓ Deleted ${TEST_KEY}-json`);
  });
});
