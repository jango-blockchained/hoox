/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live Test Suite — Cloudflare Services Integration Tests
 *
 * Shared utilities: wrangler CLI wrapper, Cloudflare REST API,
 * configuration, test resource lifecycle, and polised clack-style output.
 */

import { log, section } from "./reporter.js";

// =========================================================================
// Configuration
// =========================================================================

export interface LiveTestConfig {
  apiToken: string;
  accountId: string;
  zoneId: string;
  d1Database: string;
  kvNamespaceId: string;
  r2Bucket: string;
  queueName: string;
}

export function getConfig(): LiveTestConfig {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const d1Database = process.env.HOOX_D1_DATABASE;
  const kvNamespaceId = process.env.HOOX_KV_NAMESPACE_ID;
  const r2Bucket = process.env.HOOX_R2_BUCKET;
  const queueName = process.env.HOOX_QUEUE;

  const missing: string[] = [];
  if (!apiToken) missing.push("CLOUDFLARE_API_TOKEN");
  if (!accountId) missing.push("CLOUDFLARE_ACCOUNT_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")} — set in tests/live/env`
    );
  }
  return {
    apiToken: apiToken!,
    accountId: accountId!,
    zoneId: zoneId ?? "",
    d1Database: d1Database ?? "my-database",
    kvNamespaceId: kvNamespaceId ?? "",
    r2Bucket: r2Bucket ?? "hoox-live-test",
    queueName: queueName ?? "hoox-live-test-queue",
  };
}

// =========================================================================
// Wrangler CLI wrapper
// =========================================================================

export interface WranglerResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function wrangler(
  args: string[],
  cwd?: string,
  stdin?: string
): Promise<WranglerResult> {
  try {
    const proc = Bun.spawn(["wrangler", ...args], {
      cwd: cwd ?? process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    });
    if (stdin) proc.stdin.write(stdin + "\n");
    proc.stdin.end();
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return {
      ok: exitCode === 0,
      stdout: stripWranglerBanner(stdout.trim()),
      stderr:
        stderr.trim() ||
        (exitCode !== 0 ? `wrangler exited with code ${exitCode}` : ""),
      exitCode,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      stdout: "",
      stderr: `Failed to spawn wrangler: ${err instanceof Error ? err.message : err}`,
      exitCode: -1,
    };
  }
}

function stripWranglerBanner(output: string): string {
  const lines = output.split("\n");
  const start = lines.findIndex(
    (l) =>
      l.startsWith("[") ||
      l.startsWith("{") ||
      (l.trim().length > 0 &&
        !l.includes("wrangler") &&
        !l.startsWith("⛅") &&
        !l.startsWith("│") &&
        !l.startsWith("──") &&
        !l.startsWith("There") &&
        !l.startsWith("Download") &&
        !l.startsWith("Use --remote") &&
        !l.startsWith("Resource") &&
        !l.startsWith("🌀") &&
        !l.startsWith("🪵") &&
        !l.startsWith("If you") &&
        !l.includes("update available") &&
        !l.includes("────────────────") &&
        !l.includes("╭─") &&
        !l.includes("├─"))
  );
  return start === -1 ? output : lines.slice(start).join("\n").trim();
}

// =========================================================================
// Cloudflare REST API wrapper
// =========================================================================

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export interface CfApiResponse<T = unknown> {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
}

export async function cfApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<CfApiResponse<T>> {
  const config = getConfig();
  const response = await fetch(`${CF_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as CfApiResponse<T>;
  if (!response.ok || !json.success) {
    throw new Error(
      `CF API ${method} ${path}: ${json.errors?.map((e) => e.message).join("; ") || response.status}`
    );
  }
  return json;
}

// =========================================================================
// Test resources
// =========================================================================

const TEST_ID = `live_test_${Date.now()}`;

export function testResourceName(base: string): string {
  return `${base}_${TEST_ID}`;
}

export function skipIfMissing(...vars: string[]): boolean {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    log.skip(`Missing ${missing.join(", ")} — set in tests/live/.env`);
    return true;
  }
  return false;
}

/**
 * Return true when every required Cloudflare env var is set, so the calling
 * describe block can self-skip instead of running tests against missing
 * resources. Pass the full list of vars the suite needs.
 */
export function hasLiveEnv(...vars: string[]): boolean {
  const required = ["CLOUDFLARE_API_TOKEN", ...vars];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    log.skip(
      `Missing ${missing.join(", ")} — set in tests/live/.env to run these tests`
    );
    return false;
  }
  return true;
}

/**
 * True only when the test suite is allowed to mutate Cloudflare state
 * (deploy workers, write secrets, etc.). Off by default to keep
 * `bun test tests/live/` safe in local dev — opt in with
 * `HOOX_DEPLOY_TESTS=1`.
 */
export function canMutateCloudflare(): boolean {
  if (process.env.HOOX_DEPLOY_TESTS !== "1") {
    log.skip(
      "HOOX_DEPLOY_TESTS not set — skipping deploy/mutate tests (set to 1 to opt in)"
    );
    return false;
  }
  return true;
}

// Re-exports for convenience
export { log, section };
