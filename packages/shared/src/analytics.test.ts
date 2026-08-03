/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { trackAnalytics } from "./analytics.js";

describe("trackAnalytics indexes option", () => {
  let fetchMock: ReturnType<typeof mock>;

  beforeEach(() => {
    fetchMock = mock(() => Promise.resolve(new Response("{}")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it("forwards indexes field when option is provided", async () => {
    const env = {
      ANALYTICS_SERVICE: { fetch: fetchMock } as unknown as Fetcher,
    };
    await trackAnalytics(
      env,
      "/track/api-call",
      { worker: "hoox", endpoint: "/webhook", latencyMs: 42, success: true },
      { indexes: ["probe-abc-123"] }
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const req = fetchMock.mock.calls[0]?.[0] as Request;
    const body = (await new Response(req.body).json()) as Record<
      string,
      unknown
    >;
    expect(body.indexes).toEqual(["probe-abc-123"]);
  });

  it("omits indexes field when option is not provided", async () => {
    const env = {
      ANALYTICS_SERVICE: { fetch: fetchMock } as unknown as Fetcher,
    };
    await trackAnalytics(env, "/track/api-call", { foo: "bar" });
    const req = fetchMock.mock.calls[0]?.[0] as Request;
    const body = (await new Response(req.body).json()) as Record<
      string,
      unknown
    >;
    expect(body.indexes).toBeUndefined();
  });
});
