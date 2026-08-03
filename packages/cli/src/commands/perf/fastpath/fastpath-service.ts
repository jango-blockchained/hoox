/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orchestrates a fast-path probe run:
 *   1. Sends N probes in parallel (bounded by concurrency).
 *   2. Collects per-iteration results.
 *   3. Queries Cloudflare Workers Observability for per-hop timings.
 *   4. Aggregates and returns a FastPathReport.
 */

import { resolveGatewayUrl } from "../../../services/perf/endpoint-resolver.js";
import { ObservabilityReader } from "../../../services/perf/observability-reader.js";
import {
  sendProbe,
  type ProbeRequest,
} from "../../../services/perf/probe-sender.js";
import { summarize } from "../../../services/perf/percentile.js";
import { CLIError, ExitCode } from "../../../utils/errors.js";
import type { FastPathReport, HopStats } from "./types.js";

export interface RunConfig {
  n: number;
  concurrency: number;
  symbol: string;
  action: "LONG" | "SHORT";
  quantity: number;
  timeoutMs: number;
  apiKey: string;
  observabilityReader?: ObservabilityReader;
}

const DEFAULTS = {
  n: 10,
  concurrency: 4,
  symbol: "BTCUSDT",
  action: "LONG" as const,
  quantity: 0.001,
  timeoutMs: 5000,
};

export class FastPathService {
  async run(config: Partial<RunConfig>): Promise<FastPathReport> {
    const cfg: Required<Omit<RunConfig, "observabilityReader">> = {
      n: clampInt(config.n ?? DEFAULTS.n, 1, 1000, "n"),
      concurrency: clampInt(
        config.concurrency ?? DEFAULTS.concurrency,
        1,
        16,
        "concurrency"
      ),
      symbol: config.symbol ?? DEFAULTS.symbol,
      action: config.action ?? DEFAULTS.action,
      quantity: config.quantity ?? DEFAULTS.quantity,
      timeoutMs: clampInt(
        config.timeoutMs ?? DEFAULTS.timeoutMs,
        100,
        60_000,
        "timeoutMs"
      ),
      apiKey:
        config.apiKey ??
        process.env.WEBHOOK_API_KEY_BINDING ??
        process.env.HOOX_API_KEY ??
        "",
    };

    if (!cfg.apiKey) {
      throw new Error(
        "API key not provided. Set --api-key, WEBHOOK_API_KEY_BINDING, or HOOX_API_KEY env var."
      );
    }

    // resolveGatewayUrl returns the bare gateway origin (e.g.
    // https://hoox.cryptolinx.workers.dev). The hoox gateway
    // exposes the trade webhook at POST /webhook, so we must
    // append the path. Without this, probes hit the root and
    // return 404 (the bug behind the 2026-06-27 fastpath
    // measurement returning 0/50 successful).
    const url = `${resolveGatewayUrl()}/webhook`;
    const tRunStart = Date.now();

    // ── 1. Send probes with bounded concurrency ──
    const results = await runWithConcurrency(
      cfg.n,
      cfg.concurrency,
      async (_i) => {
        const probe_id = crypto.randomUUID();
        const req: ProbeRequest = {
          // The hoox gateway reads the API key from the body
          // (apiKey field). Earlier the fastpath put it in a
          // header, which the gateway ignored → 403. Now we
          // include it in the body to match the gateway's auth.
          apiKey: cfg.apiKey,
          probe: true,
          probe_id,
          symbol: cfg.symbol,
          action: cfg.action,
          quantity: cfg.quantity,
          timestamp: Date.now(),
        };
        return sendProbe(req, {
          url,
          apiKey: cfg.apiKey,
          timeoutMs: cfg.timeoutMs,
        });
      }
    );

    // ── 2. Aggregate per-iteration totals ──
    const totalMsValues: number[] = [];
    let successful = 0;
    let failed = 0;
    const probeIds: string[] = [];
    for (const r of results) {
      probeIds.push(r.probe_id);
      if (r.status === "ok" && r.total_ms != null) {
        totalMsValues.push(r.total_ms);
        successful++;
      } else if (r.status === "auth_failed") {
        // Auth failure: bail early with a clear error
        throw new Error(
          `Authentication failed (HTTP ${r.http_status}). Check --api-key or env.`
        );
      } else {
        failed++;
      }
    }

    // ── 3. Query observability for per-hop timings ──
    const windowEnd = Date.now() + 2000; // 2s padding for ingestion delay
    const reader = config.observabilityReader ?? new ObservabilityReader();
    const obs = await reader.readProbeEvents({
      probeIds,
      from: tRunStart - 1000,
      to: windowEnd,
    });

    // ── 4. Build per-hop stats ──
    const hopStats: HopStats[] = obs.hops.map((h) => {
      const s = summarize(h.samples);
      return {
        service: h.service,
        count: s.count,
        p50: round(s.p50),
        p95: round(s.p95),
        p99: round(s.p99),
        mean: round(s.mean),
        min: round(s.min),
        max: round(s.max),
      };
    });
    hopStats.sort((a, b) => a.service.localeCompare(b.service));

    // ── 5. Total stats from CLI-measured round-trip ──
    const total = summarize(totalMsValues);
    const totalStats: HopStats = {
      service: "total",
      count: total.count,
      p50: round(total.p50),
      p95: round(total.p95),
      p99: round(total.p99),
      mean: round(total.mean),
      min: round(total.min),
      max: round(total.max),
    };

    // ── 6. Bottleneck: hop whose p95 is the largest fraction of total.p95 ──
    let bottleneck: string | null = null;
    if (totalStats.p95 > 0) {
      let maxShare = 0;
      for (const h of hopStats) {
        if (h.p95 === 0) continue;
        const share = h.p95 / totalStats.p95;
        if (share > maxShare) {
          maxShare = share;
          bottleneck = h.service;
        }
      }
    }

    return {
      iterations: cfg.n,
      successful,
      failed,
      degraded: obs.degraded,
      total: totalStats,
      hops: hopStats,
      bottleneck,
      duration_ms: Date.now() - tRunStart,
      window: { from: tRunStart - 1000, to: windowEnd },
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function clampInt(
  value: number,
  min: number,
  max: number,
  name: string
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CLIError(
      `${name} must be an integer in [${min}, ${max}], got ${value}`,
      ExitCode.INVALID_USAGE
    );
  }
  return value;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function runWithConcurrency<T>(
  n: number,
  concurrency: number,
  task: (i: number) => Promise<T>
): Promise<T[]> {
  const results: T[] = new Array(n);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= n) return;
      results[i] = await task(i);
    }
  }

  const workers: Array<Promise<void>> = [];
  const w = Math.min(concurrency, n);
  for (let i = 0; i < w; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}
