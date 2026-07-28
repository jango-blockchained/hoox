/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, mock } from "bun:test";
import {
  ObservabilityReader,
  type ObservabilityQueryRequest,
} from "./observability-reader.js";

const ALL_EVENTS = [
  {
    $metadata: {
      service: "hoox",
      timestamp: "2026-06-21T10:00:00.000Z",
      message: JSON.stringify({
        probe_id: "p-1",
        hop: "hoox-gateway",
        duration_ms: 18,
      }),
    },
  },
  {
    $metadata: {
      service: "hoox",
      timestamp: "2026-06-21T10:00:00.050Z",
      message: JSON.stringify({
        probe_id: "p-1",
        hop: "hoox-gateway",
        duration_ms: 22,
      }),
    },
  },
  {
    $metadata: {
      service: "trade-worker",
      timestamp: "2026-06-21T10:00:00.020Z",
      message: JSON.stringify({
        probe_id: "p-1",
        hop: "trade-worker-receive",
        duration_ms: 21,
      }),
    },
  },
];

const filteredQuery = mock((req: ObservabilityQueryRequest) => {
  const serviceFilter = req.parameters?.filters?.find((f) => f.value)?.value as
    | string
    | undefined;
  const events = serviceFilter
    ? ALL_EVENTS.filter((e) => e.$metadata.service === serviceFilter)
    : ALL_EVENTS;
  return Promise.resolve({ success: true, events });
});

describe("ObservabilityReader.readProbeEvents", () => {
  it("groups events by service:hop and parses probe_id log lines", async () => {
    filteredQuery.mockClear();
    const reader = new ObservabilityReader({
      query: filteredQuery,
    });

    const result = await reader.readProbeEvents({
      probeIds: ["p-1"],
      from: Date.now() - 60_000,
      to: Date.now(),
    });

    expect(result.degraded).toBe(false);
    expect(result.hops).toHaveLength(2);

    const hoox = result.hops.find((h) => h.service === "hoox:hoox-gateway");
    expect(hoox).toBeDefined();
    expect(hoox?.samples).toEqual([18, 22]);
    expect(hoox?.count).toBe(2);

    const tw = result.hops.find(
      (h) => h.service === "trade-worker:trade-worker-receive"
    );
    expect(tw?.samples).toEqual([21]);
  });

  it("falls back to bare service name when hop is absent (legacy)", async () => {
    const legacyEvents = [
      {
        $metadata: {
          service: "hoox",
          message: JSON.stringify({
            probe_id: "p-1",
            duration_ms: 15,
          }),
        },
      },
    ];
    const legacyQuery = mock((req: ObservabilityQueryRequest) => {
      const serviceFilter = req.parameters?.filters?.find((f) => f.value)
        ?.value as string | undefined;
      const events = serviceFilter
        ? legacyEvents.filter((e) => e.$metadata.service === serviceFilter)
        : legacyEvents;
      return Promise.resolve({ success: true, events });
    });
    const reader = new ObservabilityReader({ query: legacyQuery });
    const result = await reader.readProbeEvents({
      probeIds: ["p-1"],
      from: 0,
      to: Date.now(),
    });
    const hoox = result.hops.find((h) => h.service === "hoox");
    expect(hoox).toBeDefined();
    expect(hoox?.samples).toEqual([15]);
  });

  it("returns degraded when no matching events found", async () => {
    const emptyQuery = mock(() =>
      Promise.resolve({ success: true, events: [] })
    );
    const reader = new ObservabilityReader({ query: emptyQuery });
    const result = await reader.readProbeEvents({
      probeIds: ["missing"],
      from: Date.now() - 60_000,
      to: Date.now(),
    });
    expect(result.degraded).toBe(true);
    expect(result.hops).toHaveLength(0);
  });

  it("ignores events whose message is not valid JSON or lacks probe_id", async () => {
    const noisyEvents = [
      { $metadata: { service: "hoox", message: "plain log line" } },
      {
        $metadata: {
          service: "hoox",
          message: JSON.stringify({ hop: "hoox" }),
        },
      },
      {
        $metadata: {
          service: "hoox",
          message: JSON.stringify({
            probe_id: "p-1",
            hop: "hoox-gateway",
            duration_ms: 12,
          }),
        },
      },
    ];
    const noisyQuery = mock((req: ObservabilityQueryRequest) => {
      const serviceFilter = req.parameters?.filters?.find((f) => f.value)
        ?.value as string | undefined;
      const events = serviceFilter
        ? noisyEvents.filter((e) => e.$metadata.service === serviceFilter)
        : noisyEvents;
      return Promise.resolve({ success: true, events });
    });
    const reader = new ObservabilityReader({ query: noisyQuery });
    const result = await reader.readProbeEvents({
      probeIds: ["p-1"],
      from: 0,
      to: Date.now(),
    });
    const hoox = result.hops.find((h) => h.service === "hoox:hoox-gateway");
    expect(hoox?.samples).toEqual([12]);
  });
});
