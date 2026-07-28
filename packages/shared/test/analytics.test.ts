/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for analytics tracking utilities
 * Run with: bun test packages/shared/tests/analytics.test.ts
 */

import { describe, test, expect, mock } from "bun:test";
import { trackAnalytics } from "../src/analytics";
import type { AnalyticsEnv } from "../src/analytics";

/**
 * Creates a mock analytics environment with an optional Fetcher service.
 * When ANALYTICS_SERVICE is configured, the mock fetch records all
 * request details for assertion while returning a 200 response.
 */
/**
 * Mock env type. `INTERNAL_KEY_BINDING` is intentionally NOT on
 * `AnalyticsEnv` (see comment in src/analytics.ts) to avoid
 * duplicate-property conflicts in workers whose `Env` extends both
 * `Cloudflare.Env` and `AnalyticsEnv`. The function reads it
 * dynamically and tests inject it via the spread below.
 */
type MockEnv = AnalyticsEnv & {
  _fetchMock?: ReturnType<typeof mock>;
  INTERNAL_KEY_BINDING?: string;
};

function createMockEnv(withService: boolean, internalKey?: string): MockEnv {
  if (!withService) {
    return internalKey ? { INTERNAL_KEY_BINDING: internalKey } : {};
  }

  const fetchFn = mock((_request: Request): Promise<Response> => {
    return Promise.resolve(new Response(null, { status: 200 }));
  });

  return {
    ANALYTICS_SERVICE: { fetch: fetchFn } as unknown as Fetcher,
    ...(internalKey ? { INTERNAL_KEY_BINDING: internalKey } : {}),
    _fetchMock: fetchFn,
  };
}

describe("trackAnalytics", () => {
  test("returns immediately when ANALYTICS_SERVICE is not configured", async () => {
    const env = createMockEnv(false);

    const result = await trackAnalytics(env, "/track/test", { key: "value" });

    expect(result).toBeUndefined();
  });

  test("sends POST request when ANALYTICS_SERVICE is configured", async () => {
    const env = createMockEnv(true) as AnalyticsEnv & {
      _fetchMock: ReturnType<typeof mock>;
    };

    await trackAnalytics(env, "/track/api-call", { action: "test" });

    expect(env._fetchMock.mock.calls.length).toBe(1);
    const request = env._fetchMock.mock.calls[0][0] as Request;
    expect(request.method).toBe("POST");
  });

  test("sends correct Content-Type header", async () => {
    const env = createMockEnv(true) as AnalyticsEnv & {
      _fetchMock: ReturnType<typeof mock>;
    };

    await trackAnalytics(env, "/track/test", { data: 1 });

    const request = env._fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get("Content-Type")).toBe("application/json");
  });

  test("sends the body as JSON", async () => {
    const env = createMockEnv(true) as AnalyticsEnv & {
      _fetchMock: ReturnType<typeof mock>;
    };
    const payload = { userId: "abc123", event: "page_view" };

    await trackAnalytics(env, "/track/test", payload);

    const request = env._fetchMock.mock.calls[0][0] as Request;
    const bodyText = await request.text();
    const parsedBody = JSON.parse(bodyText);
    expect(parsedBody).toEqual(payload);
  });

  test("sends the correct endpoint path", async () => {
    const env = createMockEnv(true) as AnalyticsEnv & {
      _fetchMock: ReturnType<typeof mock>;
    };
    const endpoint = "/track/api-call";

    await trackAnalytics(env, endpoint, {});

    const request = env._fetchMock.mock.calls[0][0] as Request;
    expect(new URL(request.url).pathname).toBe(endpoint);
  });

  test("handles fetch errors gracefully (never throws)", async () => {
    const fetchFn = mock((_request: Request): Promise<Response> => {
      return Promise.reject(new Error("Network failure"));
    });

    const env = {
      ANALYTICS_SERVICE: { fetch: fetchFn } as unknown as Fetcher,
    };

    // Suppress console.error output during this test
    const originalConsoleError = console.error;
    console.error = mock(() => {});

    try {
      const result = await trackAnalytics(env, "/track/test", {});
      expect(result).toBeUndefined();
    } finally {
      console.error = originalConsoleError;
    }

    // Verify the fetch was attempted
    expect(fetchFn.mock.calls.length).toBe(1);
  });

  test("sends X-Internal-Auth-Key header when INTERNAL_KEY_BINDING is set", async () => {
    const env = createMockEnv(true, "secret-key-123") as AnalyticsEnv & {
      _fetchMock: ReturnType<typeof mock>;
    };

    await trackAnalytics(env, "/track/api-call", { action: "test" });

    const request = env._fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get("X-Internal-Auth-Key")).toBe("secret-key-123");
  });

  test("omits X-Internal-Auth-Key header when INTERNAL_KEY_BINDING is unset", async () => {
    const env = createMockEnv(true) as AnalyticsEnv & {
      _fetchMock: ReturnType<typeof mock>;
    };

    await trackAnalytics(env, "/track/api-call", { action: "test" });

    const request = env._fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get("X-Internal-Auth-Key")).toBeNull();
  });

  test("omits X-Internal-Auth-Key header when INTERNAL_KEY_BINDING is empty string", async () => {
    const env = createMockEnv(true, "") as AnalyticsEnv & {
      _fetchMock: ReturnType<typeof mock>;
    };

    await trackAnalytics(env, "/track/api-call", { action: "test" });

    const request = env._fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get("X-Internal-Auth-Key")).toBeNull();
  });
});
