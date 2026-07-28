/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

// Mock modules before imports — matches the pattern used by
// `api-routes.test.ts` so route handlers can import `server-only` and
// `@opennextjs/cloudflare` under the bun test runner.
mock.module("server-only", () => {
  return {};
});

mock.module("@opennextjs/cloudflare", () => {
  return { getCloudflareContext: () => ({ env: {} }) };
});

// Store original env so each test starts from a known baseline.
const originalEnv = { ...process.env };

// `fetch` is mocked per-test so we can control how the dashboard route
// sees the telegram-worker.
let mockFetchResponse:
  | { ok: boolean; status: number; jsonBody: Record<string, unknown> }
  | { throw: Error }
  | null = null;

const originalFetch = global.fetch;

describe("Notifications API: POST /api/notifications/send", () => {
  let sendRoute: typeof import("../src/app/api/notifications/send/route");

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.TELEGRAM_WORKER_URL = "https://telegram.example.workers.dev";
    process.env.TELEGRAM_INTERNAL_KEY_BINDING = "test-internal-key";
    mockFetchResponse = {
      ok: true,
      status: 200,
      jsonBody: { success: true, message: "ok" },
    };

    // Wrap global.fetch so each test gets a deterministic response.
    global.fetch = mock(async () => {
      // Capture the closure value into a local so TS narrows correctly
      // (closure variables are not narrowed across the type guard).
      const r = mockFetchResponse;
      if (!r) {
        throw new Error("mockFetchResponse not set");
      }
      if ("throw" in r) {
        throw r.throw;
      }
      return {
        ok: r.ok,
        status: r.status,
        statusText: "OK",
        json: async () => r.jsonBody,
      } as unknown as Response;
    }) as unknown as typeof fetch;

    sendRoute = await import("../src/app/api/notifications/send/route");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  test("POST returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    const body = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid JSON");
  });

  test("POST returns 400 with Zod error when chatId is non-numeric", async () => {
    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "not-a-number",
        level: "info",
        title: "Hi",
        message: "There",
      }),
    });
    const response = await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    const body = (await response.json()) as {
      success: boolean;
      error: string;
      issues?: unknown[];
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
  });

  test("POST returns 400 when level is not in the enum", async () => {
    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "123",
        level: "bogus",
        title: "Hi",
        message: "There",
      }),
    });
    const response = await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  test("POST returns 400 when title is empty", async () => {
    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "123",
        level: "info",
        title: "",
        message: "There",
      }),
    });
    const response = await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  test("POST forwards a valid payload to the telegram-worker", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    global.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: String(input), init: init ?? {} };
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ ok: true, result: { message_id: 1 } }),
        } as unknown as Response;
      }
    ) as unknown as typeof fetch;

    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "-100200300",
        level: "warning",
        title: "Heads up",
        message: "Something happened",
      }),
    });

    const response = await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      forwarded: { chatId: string; level: string; title: string };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.forwarded.chatId).toBe("-100200300");
    expect(body.forwarded.level).toBe("warning");
    expect(body.forwarded.title).toBe("Heads up");

    // Verify the upstream call shape
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://telegram.example.workers.dev/send");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["X-Internal-Auth-Key"]).toBe("test-internal-key");
    const sentBody = JSON.parse(captured!.init.body as string);
    expect(sentBody.chat_id).toBe("-100200300");
    expect(sentBody.parse_mode).toBe("MarkdownV2");
    expect(sentBody.text).toContain("Heads up");
    expect(sentBody.text).toContain("⚠️"); // warning emoji
    expect(sentBody.source).toBe("dashboard-tester");
  });

  test("POST returns 400 when telegram-worker responds with 4xx", async () => {
    mockFetchResponse = {
      ok: false,
      status: 400,
      jsonBody: { error: "Bad chat id" },
    };

    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "123",
        level: "error",
        title: "Oops",
        message: "Something broke",
      }),
    });

    const response = await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    const body = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Bad chat id");
  });

  test("POST returns 502 when telegram-worker responds with 5xx", async () => {
    mockFetchResponse = {
      ok: false,
      status: 503,
      jsonBody: { error: "telegram upstream timeout" },
    };

    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "123",
        level: "info",
        title: "Test",
        message: "Body",
      }),
    });

    const response = await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    const body = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toContain("telegram");
  });

  test("POST returns 500 when fetch throws", async () => {
    mockFetchResponse = { throw: new Error("Network down") };

    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "123",
        level: "info",
        title: "Test",
        message: "Body",
      }),
    });

    const response = await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    const body = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  test("POST trims trailing slash on telegram URL", async () => {
    process.env.TELEGRAM_WORKER_URL = "https://telegram.example.workers.dev/";

    let captured: { url: string } | null = null;
    global.fetch = mock(async (input: RequestInfo | URL) => {
      captured = { url: String(input) };
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ ok: true }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const request = new Request("http://localhost/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "1",
        level: "success",
        title: "T",
        message: "M",
      }),
    });

    await sendRoute.POST(
      request as unknown as Parameters<typeof sendRoute.POST>[0]
    );
    expect(captured!.url).toBe("https://telegram.example.workers.dev/send");
  });
});

describe("Notifications API: GET /api/notifications/recent", () => {
  let recentRoute: typeof import("../src/app/api/notifications/recent/route");

  beforeEach(async () => {
    process.env = { ...originalEnv };
    recentRoute = await import("../src/app/api/notifications/recent/route");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("GET returns success with empty alerts array", async () => {
    const response = await recentRoute.GET();
    const body = (await response.json()) as {
      success: boolean;
      alerts: unknown[];
      note?: string;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.alerts).toHaveLength(0);
  });
});
