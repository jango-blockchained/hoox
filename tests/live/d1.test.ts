/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live D1 Database Tests
 *
 * Tests Cloudflare D1 serverless SQL database via wrangler CLI.
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, HOOX_D1_DATABASE
 *
 * What's tested:
 *   - d1 list — list databases
 *   - d1 execute — run SQL queries
 *   - CREATE TABLE, INSERT, SELECT, UPDATE, DELETE
 *   - Batch operations
 *   - D1 health query (SELECT 1)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  getConfig,
  wrangler,
  skipIfMissing,
  hasLiveEnv,
  section,
  testResourceName,
} from "./helpers";

const TEST_TABLE = testResourceName("live_test_items");

// Skip these live integration tests when no Cloudflare credentials available
const hasCloudflareEnv = hasLiveEnv("HOOX_D1_DATABASE");
(hasCloudflareEnv ? describe : describe.skip)("D1 Database", () => {
  let config: ReturnType<typeof getConfig>;

  beforeAll(async () => {
    config = getConfig();
    if (skipIfMissing("HOOX_D1_DATABASE")) return;
  });

  // -----------------------------------------------------------------------
  // List
  // -----------------------------------------------------------------------

  test("d1 list returns databases", { timeout: 60000 }, async () => {
    section("List databases");
    const result = await wrangler(["d1", "list"]);
    expect(result.ok).toBe(true);
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stdout).toContain(config.d1Database);
    console.log(`  ✓ Found database "${config.d1Database}" in D1 list`);
  });

  // -----------------------------------------------------------------------
  // Execute queries
  // -----------------------------------------------------------------------

  test(
    "SELECT 1 returns one row (health check)",
    { timeout: 60000 },
    async () => {
      section("Health check");
      const result = await wrangler([
        "d1",
        "execute",
        config.d1Database,
        "--command",
        "SELECT 1",
        "--remote",
      ]);
      expect(result.ok).toBe(true);
      expect(result.stdout).toContain("1");
      console.log("  ✓ SELECT 1 works");
    }
  );

  test(
    "SELECT table_name FROM sqlite_master returns schema info",
    { timeout: 60000 },
    async () => {
      const result = await wrangler([
        "d1",
        "execute",
        config.d1Database,
        "--command",
        "SELECT name AS table_name FROM sqlite_master WHERE type='table' LIMIT 5",
        "--remote",
        "--json",
      ]);
      expect(result.ok).toBe(true);
      const parsed = JSON.parse(result.stdout);
      const results = parsed[0]?.results ?? [];
      console.log(
        `  ✓ Found ${results.length} system table(s): ${results.map((r: { table_name: string }) => r.table_name).join(", ")}`
      );
    }
  );

  // -----------------------------------------------------------------------
  // Table lifecycle
  // -----------------------------------------------------------------------

  test(`CREATE TABLE ${TEST_TABLE}`, { timeout: 60000 }, async () => {
    section("Table lifecycle");
    const result = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (id INTEGER PRIMARY KEY, name TEXT NOT NULL, value REAL, created_at TEXT DEFAULT (datetime('now')))`,
      "--remote",
    ]);
    expect(result.ok).toBe(true);
    console.log(`  ✓ Created table "${TEST_TABLE}"`);
  });

  test(`INSERT rows into ${TEST_TABLE}`, { timeout: 60000 }, async () => {
    const result = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `INSERT INTO ${TEST_TABLE} (name, value) VALUES ('alpha', 100.5), ('beta', 200.75), ('gamma', 300.0)`,
      "--remote",
    ]);
    expect(result.ok).toBe(true);
    console.log("  ✓ Inserted 3 rows");
  });

  test(`SELECT rows from ${TEST_TABLE}`, { timeout: 60000 }, async () => {
    const result = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `SELECT * FROM ${TEST_TABLE} ORDER BY id`,
      "--remote",
      "--json",
    ]);
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.stdout);
    const rows = parsed[0]?.results ?? [];
    expect(rows.length).toBe(3);
    expect(rows[0].name).toBe("alpha");
    expect(rows[1].name).toBe("beta");
    expect(rows[2].name).toBe("gamma");
    expect(rows[0].value).toBe(100.5);
    console.log(`  ✓ SELECT returned ${rows.length} rows`);
  });

  test(`UPDATE row in ${TEST_TABLE}`, { timeout: 60000 }, async () => {
    const result = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `UPDATE ${TEST_TABLE} SET value = 999.99 WHERE name = 'beta'`,
      "--remote",
    ]);
    expect(result.ok).toBe(true);

    // Verify update
    const verify = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `SELECT value FROM ${TEST_TABLE} WHERE name = 'beta'`,
      "--remote",
      "--json",
    ]);
    const parsed = JSON.parse(verify.stdout);
    expect(parsed[0]?.results?.[0]?.value).toBe(999.99);
    console.log("  ✓ UPDATE verified");
  });

  test(`DELETE row from ${TEST_TABLE}`, { timeout: 60000 }, async () => {
    const result = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `DELETE FROM ${TEST_TABLE} WHERE name = 'gamma'`,
      "--remote",
    ]);
    expect(result.ok).toBe(true);

    const verify = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `SELECT count(*) AS cnt FROM ${TEST_TABLE}`,
      "--remote",
      "--json",
    ]);
    const parsed = JSON.parse(verify.stdout);
    expect(parsed[0]?.results?.[0]?.cnt).toBe(2);
    console.log("  ✓ DELETE verified (2 rows remaining)");
  });

  // -----------------------------------------------------------------------
  // Batch operations
  // -----------------------------------------------------------------------

  test("Batch INSERT via multiple statements", { timeout: 60000 }, async () => {
    section("Batch operations");
    const result = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `INSERT INTO ${TEST_TABLE} (name, value) VALUES ('delta', 400.25); INSERT INTO ${TEST_TABLE} (name, value) VALUES ('epsilon', 500.5)`,
      "--remote",
    ]);
    expect(result.ok).toBe(true);

    const verify = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `SELECT count(*) AS cnt FROM ${TEST_TABLE}`,
      "--remote",
      "--json",
    ]);
    const parsed = JSON.parse(verify.stdout);
    expect(parsed[0]?.results?.[0]?.cnt).toBe(4);
    console.log("  ✓ Batch INSERT verified (4 rows)");
  });

  // -----------------------------------------------------------------------
  // Schema introspection
  // -----------------------------------------------------------------------

  test("PRAGMA table_info returns schema", { timeout: 60000 }, async () => {
    section("Schema introspection");
    const result = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `PRAGMA table_info(${TEST_TABLE})`,
      "--remote",
      "--json",
    ]);
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.stdout);
    const columns = parsed[0]?.results ?? [];
    expect(columns.length).toBe(4);
    const colNames = columns.map((c: { name: string }) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("name");
    expect(colNames).toContain("value");
    expect(colNames).toContain("created_at");
    console.log(
      `  ✓ Table has ${columns.length} columns: ${colNames.join(", ")}`
    );
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  test(`DROP TABLE ${TEST_TABLE} (cleanup)`, { timeout: 60000 }, async () => {
    section("Cleanup");
    const result = await wrangler([
      "d1",
      "execute",
      config.d1Database,
      "--command",
      `DROP TABLE IF EXISTS ${TEST_TABLE}`,
      "--remote",
    ]);
    expect(result.ok).toBe(true);
    console.log(`  ✓ Dropped table "${TEST_TABLE}"`);
  });
});
