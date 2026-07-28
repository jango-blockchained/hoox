/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `TraceService` (src/commands/trace/trace-service.ts).
 *
 * Mocks global fetch() to exercise every method without hitting the
 * Cloudflare API. Covers:
 *   - Constructor / credential validation
 *   - cfApi error paths (HTTP error, !ok response, network error)
 *   - query() with events / calculations / invocations views
 *   - queryEvents() / queryMetrics() with all filter combinations
 *   - listKeys() with and without needle
 *   - listValues() with all options
 *   - listDestinations() / createDestination() / deleteDestination()
 *   - getUsage() with and without breakdown
 *   - prepareLiveTail() / liveTailHeartbeat()
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { TraceService } from "./trace-service.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };

type FetchCall = {
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
};

interface MockResponse {
  status?: number;
  body: unknown;
}

/**
 * Install a fetch mock that returns the supplied response for any URL.
 * Returns a list that captures every call so tests can assert on them.
 */
function installFetchMock(responses: Record<string, MockResponse | unknown>): {
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];

  globalThis.fetch = mock(
    async (url: string, init?: Record<string, unknown>) => {
      let matched: MockResponse | unknown = null;
      for (const [pattern, response] of Object.entries(responses)) {
        if ((url as string).includes(pattern)) {
          matched = response;
          break;
        }
      }
      calls.push({
        url: url as string,
        method: (init?.method as string) ?? "GET",
        body: (init?.body as string) ?? undefined,
        headers: (init?.headers as Record<string, string>) ?? undefined,
      });
      if (matched === null) {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 0, message: "no match" }],
          }),
          { status: 404 }
        );
      }
      // undefined → empty 200 response (valid for DELETE/heartbeat endpoints).
      if (matched === undefined) {
        return new Response(JSON.stringify({ success: true, result: null }), {
          status: 200,
        });
      }
      // Support either a plain object (treated as {success:true, result}) or
      // a {status, body} pair.
      if (
        typeof matched === "object" &&
        matched !== null &&
        "body" in (matched as Record<string, unknown>)
      ) {
        const r = matched as MockResponse;
        return new Response(JSON.stringify(r.body), {
          status: r.status ?? 200,
        });
      }
      return new Response(JSON.stringify({ success: true, result: matched }), {
        status: 200,
      });
    }
  ) as unknown as typeof fetch;

  return { calls };
}

function setCreds(): void {
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env = { ...realEnv };
  setCreds();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

describe("TraceService — constructor + credentials", () => {
  it("throws if CLOUDFLARE_API_TOKEN is missing", () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    expect(() => new TraceService()).toThrow(/CLOUDFLARE_API_TOKEN/);
  });

  it("throws if CLOUDFLARE_ACCOUNT_ID is missing", () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    expect(() => new TraceService()).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("constructs successfully when both env vars are set", () => {
    expect(() => new TraceService()).not.toThrow();
  });
});

describe("TraceService.query — events view", () => {
  it("normalizes events from a typical CF response", async () => {
    const { calls } = installFetchMock({
      "/telemetry/query": {
        events: {
          events: [
            { $metadata: { service: "hoox", level: "info" } },
            { $metadata: { service: "trade-worker", level: "error" } },
          ],
        },
      },
    });

    const svc = new TraceService();
    const result = await svc.query({
      view: "events",
      queryId: "test",
      parameters: { filters: [] },
      timeframe: { from: 0, to: 1 },
    });

    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events?.[0].$metadata.service).toBe("hoox");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      "/accounts/test-account/workers/observability/telemetry/query"
    );
    expect(calls[0].method).toBe("POST");
  });

  it("returns empty events array when response has no events", async () => {
    installFetchMock({ "/telemetry/query": { events: {} } });

    const svc = new TraceService();
    const result = await svc.query({
      view: "events",
      queryId: "test",
      parameters: { filters: [] },
      timeframe: { from: 0, to: 1 },
    });

    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
  });
});

describe("TraceService.query — calculations view", () => {
  it("normalizes aggregates and preserves groupBy", async () => {
    installFetchMock({
      "/telemetry/query": {
        calculations: [
          {
            calculation: "count",
            aggregates: [{ value: 42 }],
            groupBy: { service: "hoox" },
          },
          {
            calculation: "avg",
            aggregates: [{ value: "12.5" }],
            groupBy: { service: "trade-worker" },
          },
        ],
      },
    });

    const svc = new TraceService();
    const result = await svc.query({
      view: "calculations",
      queryId: "test",
      parameters: { filters: [] },
      timeframe: { from: 0, to: 1 },
    });

    expect(result.success).toBe(true);
    expect(result.metrics).toHaveLength(2);
    expect(result.metrics?.[0].calculations[0]).toEqual({
      alias: "count",
      value: 42,
    });
    expect(result.metrics?.[0].groupBy).toEqual({ service: "hoox" });
    // String "12.5" coerced to number
    expect(result.metrics?.[1].calculations[0].value).toBe(12.5);
  });

  it("handles missing aggregates and groupBy gracefully", async () => {
    installFetchMock({
      "/telemetry/query": {
        calculations: [{ calculation: "count" }],
      },
    });

    const svc = new TraceService();
    const result = await svc.query({
      view: "calculations",
      queryId: "test",
      parameters: { filters: [] },
      timeframe: { from: 0, to: 1 },
    });

    // No aggregates → empty calculations array (the result map yields no rows).
    expect(result.metrics?.[0].calculations).toEqual([]);
    expect(result.metrics?.[0].groupBy).toBeUndefined();
  });

  it("handles missing calculations array", async () => {
    installFetchMock({ "/telemetry/query": {} });

    const svc = new TraceService();
    const result = await svc.query({
      view: "calculations",
      queryId: "test",
      parameters: { filters: [] },
      timeframe: { from: 0, to: 1 },
    });

    expect(result.metrics).toEqual([]);
  });
});

describe("TraceService.query — invocations view", () => {
  it("returns bare success envelope", async () => {
    installFetchMock({ "/telemetry/query": {} });

    const svc = new TraceService();
    const result = await svc.query({
      view: "invocations",
      queryId: "test",
      parameters: { filters: [] },
      timeframe: { from: 0, to: 1 },
    });

    expect(result.success).toBe(true);
    expect(result.events).toBeUndefined();
    expect(result.metrics).toBeUndefined();
  });
});

describe("TraceService.queryEvents", () => {
  it("builds a request with no filters and uses last-hour defaults", async () => {
    const { calls } = installFetchMock({
      "/telemetry/query": { events: { events: [] } },
    });

    const svc = new TraceService();
    const before = Date.now();
    await svc.queryEvents({});
    const after = Date.now();

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.view).toBe("events");
    expect(body.queryId).toBe("trace-events");
    expect(body.parameters.filters).toEqual([]);
    expect(body.timeframe.from).toBeGreaterThanOrEqual(before - 60 * 60 * 1000);
    expect(body.timeframe.to).toBeLessThanOrEqual(after);
  });

  it("adds service / trigger / level filters when supplied", async () => {
    const { calls } = installFetchMock({
      "/telemetry/query": { events: { events: [] } },
    });

    const svc = new TraceService();
    await svc.queryEvents({
      service: "hoox",
      trigger: "fetch",
      level: "error",
      limit: 10,
      from: 1,
      to: 2,
    });

    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.parameters.filters).toEqual([
      {
        key: "$metadata.service",
        operation: "eq",
        type: "string",
        value: "hoox",
      },
      {
        key: "$metadata.trigger",
        operation: "includes",
        type: "string",
        value: "fetch",
      },
      {
        key: "$metadata.level",
        operation: "eq",
        type: "string",
        value: "error",
      },
    ]);
    expect(body.limit).toBe(10);
    expect(body.timeframe).toEqual({ from: 1, to: 2 });
  });
});

describe("TraceService.queryMetrics", () => {
  it("builds a default count calculation with no groupBy", async () => {
    const { calls } = installFetchMock({
      "/telemetry/query": { calculations: [] },
    });

    const svc = new TraceService();
    await svc.queryMetrics({});

    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.view).toBe("calculations");
    expect(body.queryId).toBe("trace-metrics");
    expect(body.parameters.calculations).toEqual([
      { operator: "count", alias: "count" },
    ]);
    expect(body.parameters.groupBys).toEqual([]);
  });

  it("uses supplied calculations and groupBy", async () => {
    const { calls } = installFetchMock({
      "/telemetry/query": { calculations: [] },
    });

    const svc = new TraceService();
    await svc.queryMetrics({
      service: "hoox",
      calculations: [
        { operator: "p99", key: "duration_ms", alias: "p99_latency" },
        { operator: "count" },
      ],
      groupBy: "trigger",
    });

    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.parameters.filters).toEqual([
      {
        key: "$metadata.service",
        operation: "eq",
        type: "string",
        value: "hoox",
      },
    ]);
    expect(body.parameters.calculations[0]).toEqual({
      operator: "p99",
      key: "duration_ms",
      keyType: "number",
      alias: "p99_latency",
    });
    expect(body.parameters.calculations[1]).toEqual({
      operator: "count",
      key: undefined,
      keyType: undefined,
      alias: "count",
    });
    expect(body.parameters.groupBys).toEqual([
      { type: "string", value: "trigger" },
    ]);
  });
});

describe("TraceService.listKeys", () => {
  it("sends needle as object and returns keys array", async () => {
    const { calls } = installFetchMock({
      "/telemetry/keys": [
        { key: "$metadata.service", type: "string" },
        { key: "$metadata.level", type: "string" },
      ],
    });

    const svc = new TraceService();
    const result = await svc.listKeys({ needle: "service" });

    expect(result.keys).toHaveLength(2);
    expect(result.keys[0].key).toBe("$metadata.service");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.needle).toEqual({
      value: "service",
      isRegex: false,
      matchCase: false,
    });
    expect(body.limit).toBe(100);
  });

  it("sends undefined needle when none supplied", async () => {
    const { calls } = installFetchMock({
      "/telemetry/keys": [],
    });

    const svc = new TraceService();
    await svc.listKeys();
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.needle).toBeUndefined();
  });
});

describe("TraceService.listValues", () => {
  it("defaults type to string and uses 1-hour timeframe", async () => {
    const { calls } = installFetchMock({
      "/telemetry/values": [
        { key: "service", type: "string", value: "hoox" },
        { key: "service", type: "string", value: "trade-worker" },
      ],
    });

    const svc = new TraceService();
    const before = Date.now();
    const result = await svc.listValues({ key: "service" });
    const after = Date.now();

    expect(result.values).toEqual(["hoox", "trade-worker"]);
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.key).toBe("service");
    expect(body.type).toBe("string");
    expect(body.datasets).toEqual([]);
    expect(body.timeframe.from).toBeGreaterThanOrEqual(before - 60 * 60 * 1000);
    expect(body.timeframe.to).toBeLessThanOrEqual(after);
  });

  it("honors explicit type and limits", async () => {
    const { calls } = installFetchMock({
      "/telemetry/values": [],
    });

    const svc = new TraceService();
    await svc.listValues({
      key: "duration_ms",
      type: "number",
      limit: 5,
      from: 100,
      to: 200,
    });

    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.type).toBe("number");
    expect(body.limit).toBe(5);
    expect(body.timeframe).toEqual({ from: 100, to: 200 });
  });
});

describe("TraceService destinations", () => {
  it("lists destinations", async () => {
    const { calls } = installFetchMock({
      "/destinations": [
        { slug: "logs", name: "Logs", type: "otlp", enabled: true },
      ],
    });

    const svc = new TraceService();
    const result = await svc.listDestinations();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("logs");
    expect(calls[0].method).toBe("GET");
  });

  it("creates a destination", async () => {
    const { calls } = installFetchMock({
      "/destinations": {
        slug: "new",
        name: "New",
        type: "otlp",
        enabled: true,
      },
    });

    const svc = new TraceService();
    const result = await svc.createDestination({
      name: "New",
      type: "otlp",
      url: "https://example.com/otlp",
    });

    expect(result.slug).toBe("new");
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body).toEqual({
      name: "New",
      type: "otlp",
      url: "https://example.com/otlp",
    });
  });

  it("deletes a destination by slug", async () => {
    const { calls } = installFetchMock({
      "/destinations/old-slug": undefined,
    });

    const svc = new TraceService();
    await svc.deleteDestination("old-slug");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/destinations/old-slug");
    expect(calls[0].method).toBe("DELETE");
  });
});

describe("TraceService.getUsage", () => {
  it("returns event count and byWorker breakdown", async () => {
    const { calls } = installFetchMock({
      "/usage": {
        events: 1234,
        breakdown: [
          { bin: "x", dataset: "y", service: "hoox", count: 100 },
          { bin: "x", dataset: "y", service: "hoox", count: 50 },
          { bin: "x", dataset: "y", service: "trade-worker", count: 200 },
        ],
      },
    });

    const svc = new TraceService();
    const result = await svc.getUsage();

    expect(result.eventCount).toBe(1234);
    expect(result.byWorker).toEqual({
      hoox: 150,
      "trade-worker": 200,
    });
    // from/to as ISO strings
    expect(typeof result.from).toBe("string");
    expect(typeof result.to).toBe("string");
    // Query params: from/to in ms
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("from")).toBeTruthy();
    expect(url.searchParams.get("to")).toBeTruthy();
  });

  it("handles missing breakdown gracefully", async () => {
    installFetchMock({
      "/usage": { events: 42 },
    });

    const svc = new TraceService();
    const result = await svc.getUsage();
    expect(result.eventCount).toBe(42);
    expect(result.byWorker).toEqual({});
  });

  it("respects explicit from/to range", async () => {
    installFetchMock({ "/usage": { events: 0 } });

    const svc = new TraceService();
    const result = await svc.getUsage({ from: 1_000, to: 2_000 });
    expect(result.from).toBe(new Date(1_000).toISOString());
    expect(result.to).toBe(new Date(2_000).toISOString());
  });
});

describe("TraceService live tail", () => {
  it("prepareLiveTail sends an empty filter when no service is given", async () => {
    const { calls } = installFetchMock({
      "/live-tail": { sessionId: "abc-123", url: "wss://example.com/live" },
    });

    const svc = new TraceService();
    const session = await svc.prepareLiveTail();
    expect(session.sessionId).toBe("abc-123");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.filters).toEqual([]);
  });

  it("prepareLiveTail adds service filter when given", async () => {
    const { calls } = installFetchMock({
      "/live-tail": { sessionId: "abc" },
    });

    const svc = new TraceService();
    await svc.prepareLiveTail({ service: "hoox" });
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.filters).toEqual([
      {
        key: "$metadata.service",
        operation: "eq",
        type: "string",
        value: "hoox",
      },
    ]);
  });

  it("liveTailHeartbeat sends a POST with the sessionId", async () => {
    const { calls } = installFetchMock({
      "/live-tail/heartbeat": undefined,
    });

    const svc = new TraceService();
    await svc.liveTailHeartbeat("session-xyz");
    expect(calls[0].url).toContain("/live-tail/heartbeat");
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body).toEqual({ sessionId: "session-xyz" });
  });
});

describe("TraceService — cfApi error paths", () => {
  it("throws CLIError when response is !ok with no errors field", async () => {
    installFetchMock({
      "/telemetry/query": {
        status: 500,
        body: { success: false, errors: [] },
      },
    });

    const svc = new TraceService();
    await expect(
      svc.query({
        view: "events",
        queryId: "x",
        parameters: { filters: [] },
        timeframe: { from: 0, to: 1 },
      })
    ).rejects.toThrow(/Cloudflare API error/);
  });

  it("throws CLIError when fetch itself rejects (network error)", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const svc = new TraceService();
    await expect(
      svc.query({
        view: "events",
        queryId: "x",
        parameters: { filters: [] },
        timeframe: { from: 0, to: 1 },
      })
    ).rejects.toThrow(/Cloudflare API request failed: ECONNREFUSED/);
  });

  it("attaches Authorization header from CLOUDFLARE_API_TOKEN", async () => {
    const { calls } = installFetchMock({ "/telemetry/keys": [] });

    const svc = new TraceService();
    await svc.listKeys();

    expect(calls[0].headers?.Authorization).toBe("Bearer test-token");
  });
});
