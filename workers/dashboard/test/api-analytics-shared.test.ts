/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

// Regression coverage for executeAnalyticsQuery.
//
// Background: the Cloudflare Analytics Engine SQL API returns a wrapper
// of the form { meta: [...], data: [...], rows: N, ... }. A previous
// version of executeAnalyticsQuery returned the full wrapper; the 4
// analytics route handlers forwarded it as { success: true, data: <wrapper> }
// and the dashboard components (and recharts internally) called
// .map() / .slice() on the wrapper object - producing "r.slice is not
// a function" on /dashboard/analytics in production. The fix is to
// extract .data in the helper. These tests pin that contract.

import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

// Mock the `server-only` import used by lib/api.ts indirectly
mock.module("server-only", () => ({}));

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("executeAnalyticsQuery (shared helper)", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account-id";
    process.env.CLOUDFLARE_API_TOKEN = "test-api-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("returns the .data array (not the wrapper) - the production fix", async () => {
    const wrapperResponse = {
      meta: [
        { name: "blob3", type: "String" },
        { name: "count()", type: "UInt64" },
      ],
      data: [
        { blob3: "/webhook", "count()": 42 },
        { blob3: "/api/auth/login", "count()": 7 },
      ],
      rows: 2,
      rows_before_limit_at_least: 2,
      duration_ms: 1.23,
    };
    global.fetch = mock(async () =>
      Promise.resolve(jsonResponse(wrapperResponse))
    ) as unknown as typeof fetch;

    const { executeAnalyticsQuery } =
      await import("../src/app/api/analytics/shared");
    const result = await executeAnalyticsQuery("SELECT 1");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(wrapperResponse.data);
    expect((result as unknown as { meta?: unknown }).meta).toBeUndefined();
    expect((result as unknown as { rows?: unknown }).rows).toBeUndefined();
  });

  it("returns an empty array when the wrapper has no data field", async () => {
    global.fetch = mock(async () =>
      Promise.resolve(jsonResponse({ rows: 0 }))
    ) as unknown as typeof fetch;

    const { executeAnalyticsQuery } =
      await import("../src/app/api/analytics/shared");
    const result = await executeAnalyticsQuery("SELECT 1");

    expect(result).toEqual([]);
  });

  it("returns an empty array when the data field is not an array", async () => {
    global.fetch = mock(async () =>
      Promise.resolve(jsonResponse({ data: "not-an-array" }))
    ) as unknown as typeof fetch;

    const { executeAnalyticsQuery } =
      await import("../src/app/api/analytics/shared");
    const result = await executeAnalyticsQuery("SELECT 1");

    expect(result).toEqual([]);
  });

  it("throws when Cloudflare credentials are missing", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    let fetchCalled = false;
    global.fetch = mock(async () => {
      fetchCalled = true;
      return Promise.resolve(jsonResponse({}));
    }) as unknown as typeof fetch;

    const { executeAnalyticsQuery } =
      await import("../src/app/api/analytics/shared");
    await expect(executeAnalyticsQuery("SELECT 1")).rejects.toThrow(
      /Cloudflare credentials not configured/
    );
    expect(fetchCalled).toBe(false);
  });

  it("throws when the upstream Analytics Engine returns a non-2xx", async () => {
    global.fetch = mock(async () =>
      Promise.resolve(
        new Response("internal error from CF", {
          status: 500,
          statusText: "Internal Server Error",
        })
      )
    ) as unknown as typeof fetch;

    const { executeAnalyticsQuery } =
      await import("../src/app/api/analytics/shared");
    await expect(executeAnalyticsQuery("SELECT 1")).rejects.toThrow(
      /Query failed: 500/
    );
  });

  it("issues a POST to the Analytics Engine SQL endpoint with the SQL as the body", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    global.fetch = mock(async (url, init) => {
      calls.push({
        url: String(url),
        body: init?.body ? String(init.body) : "",
      });
      return Promise.resolve(
        jsonResponse({ data: [{ endpoint: "/webhook", call_count: 1 }] })
      );
    }) as unknown as typeof fetch;

    const { executeAnalyticsQuery } =
      await import("../src/app/api/analytics/shared");
    await executeAnalyticsQuery("SELECT blob3 FROM hoox-analytics");

    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/test-account-id/analytics_engine/sql"
    );
    expect(calls[0]!.body).toBe("SELECT blob3 FROM hoox-analytics");
  });
});
