/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox perf fastpath` types.
 */

import type {
  ProbeRequest,
  ProbeResult,
} from "../../../services/perf/probe-sender.js";

export type { ProbeRequest, ProbeResult };

export interface HopStats {
  service: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
}

export interface FastPathReport {
  iterations: number;
  successful: number;
  failed: number;
  degraded: boolean;
  total: HopStats;
  hops: HopStats[];
  bottleneck: string | null;
  duration_ms: number;
  window: { from: number; to: number };
}
