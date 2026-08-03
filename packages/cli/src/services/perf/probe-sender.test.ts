/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  sendProbe,
  type ProbeRequest,
  type ProbeSenderOptions,
} from "./probe-sender.js";

describe("sendProbe", () => {
  let fetchMock: ReturnType<typeof mock>;
  const baseOptions: ProbeSenderOptions = {
    url: "https://hoox.test.workers.dev/webhook",
    apiKey: "test-internal-key",
    timeoutMs: 1000,
  };

  beforeEach(() => {
    fetchMock = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, probe_id: "p-1", status: "probed" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    mock.restore();
  });

  it("returns ok on 2xx response", async () => {
    const req: ProbeRequest = {
      apiKey: "test-internal-key",
      probe: true,
      probe_id: "p-1",
      symbol: "BTCUSDT",
      action: "LONG",
      quantity: 0.001,
      timestamp: Date.now(),
    };
    const result = await sendProbe(req, baseOptions);
    expect(result.status).toBe("ok");
    expect(result.http_status).toBe(200);
    expect(result.total_ms).toBeGreaterThanOrEqual(0);
    expect(result.probe_id).toBe("p-1");
  });

  it("sends apiKey in the body (hoox gateway auth)", async () => {
    const req: ProbeRequest = {
      apiKey: "test-internal-key",
      probe: true,
      probe_id: "p-2",
      symbol: "ETHUSDT",
      action: "SHORT",
      quantity: 0.5,
      timestamp: Date.now(),
    };
    await sendProbe(req, baseOptions);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.method).toBe("POST");
    expect(sent.headers.get("Content-Type")).toBe("application/json");
    // Earlier the apiKey was sent in X-Internal-Auth-Key header,
    // which the hoox gateway ignored (it reads apiKey from the
    // body). All probes got 403. Now the apiKey is in the body
    // and no header is required.
    expect(sent.headers.get("X-Internal-Auth-Key")).toBeNull();
    const body = (await new Response(sent.body).json()) as ProbeRequest;
    expect(body.probe).toBe(true);
    expect(body.probe_id).toBe("p-2");
    expect(body.apiKey).toBe("test-internal-key");
  });

  it("returns auth_failed on 401/403", async () => {
    fetchMock = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const req: ProbeRequest = {
      apiKey: "test-internal-key",
      probe: true,
      probe_id: "p-3",
      symbol: "BTCUSDT",
      action: "LONG",
      quantity: 0.001,
      timestamp: Date.now(),
    };
    const result = await sendProbe(req, baseOptions);
    expect(result.status).toBe("auth_failed");
    expect(result.http_status).toBe(401);
  });

  it("returns error on 5xx", async () => {
    fetchMock = mock(() =>
      Promise.resolve(new Response("Boom", { status: 500 }))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const req: ProbeRequest = {
      apiKey: "test-internal-key",
      probe: true,
      probe_id: "p-4",
      symbol: "BTCUSDT",
      action: "LONG",
      quantity: 0.001,
      timestamp: Date.now(),
    };
    const result = await sendProbe(req, baseOptions);
    expect(result.status).toBe("error");
    expect(result.http_status).toBe(500);
  });

  it("returns timeout when fetch takes too long", async () => {
    fetchMock = mock(
      () =>
        new Promise((_, reject) => {
          const err = new Error("aborted");
          err.name = "AbortError";
          setTimeout(() => reject(err), 50);
        })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const req: ProbeRequest = {
      apiKey: "test-internal-key",
      probe: true,
      probe_id: "p-5",
      symbol: "BTCUSDT",
      action: "LONG",
      quantity: 0.001,
      timestamp: Date.now(),
    };
    const result = await sendProbe(req, { ...baseOptions, timeoutMs: 10 });
    expect(result.status).toBe("timeout");
  });

  it("returns error when fetch throws", async () => {
    fetchMock = mock(() => Promise.reject(new Error("network down")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const req: ProbeRequest = {
      apiKey: "test-internal-key",
      probe: true,
      probe_id: "p-6",
      symbol: "BTCUSDT",
      action: "LONG",
      quantity: 0.001,
      timestamp: Date.now(),
    };
    const result = await sendProbe(req, baseOptions);
    expect(result.status).toBe("error");
    expect(result.error).toContain("network down");
  });
});
