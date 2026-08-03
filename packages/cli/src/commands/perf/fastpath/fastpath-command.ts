/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox perf fastpath` — measure the deployed fast-path latency.
 *
 * Subcommands:
 *   run [options]      Send N probes and report a percentile table
 *   tail [options]     Send probes for a fixed duration (continuous)
 *   report [options]   Query past probe events and report
 */

import type { Command } from "commander";
import { FastPathService } from "./fastpath-service.js";
import { ObservabilityReader } from "../../../services/perf/observability-reader.js";
import { summarize } from "../../../services/perf/percentile.js";
import type { FormatOptions } from "../../../utils/formatters.js";
import {
  formatTable,
  getFormatOptions,
  formatSuccess,
} from "../../../utils/formatters.js";
import { withErrorHandling } from "../../../utils/error-handler.js";
import { theme, icons } from "../../../utils/theme.js";
import { ExitCode, CLIError } from "../../../utils/errors.js";
import type { FastPathReport } from "./types.js";

// ── run ──────────────────────────────────────────────────────────────────

interface RunOptions {
  n?: string;
  concurrency?: string;
  symbol?: string;
  action?: string;
  quantity?: string;
  timeout?: string;
  apiKey?: string;
}

async function handleRun(opts: RunOptions, fmt: FormatOptions): Promise<void> {
  const config: Parameters<FastPathService["run"]>[0] = {};
  if (opts.n !== undefined) config.n = parseInt(opts.n, 10);
  if (opts.concurrency !== undefined)
    config.concurrency = parseInt(opts.concurrency, 10);
  if (opts.symbol !== undefined) config.symbol = opts.symbol;
  if (opts.action !== undefined) {
    if (opts.action !== "LONG" && opts.action !== "SHORT") {
      throw new CLIError(
        `--action must be LONG or SHORT, got "${opts.action}"`,
        ExitCode.INVALID_USAGE
      );
    }
    config.action = opts.action;
  }
  if (opts.quantity !== undefined) config.quantity = parseFloat(opts.quantity);
  if (opts.timeout !== undefined) config.timeoutMs = parseInt(opts.timeout, 10);
  if (opts.apiKey !== undefined) config.apiKey = opts.apiKey;

  const spinner = (await import("@clack/prompts")).spinner();
  spinner.start(`Probing fast path: 0/0`);
  const service = new FastPathService();
  const report = await service.run(config);
  spinner.stop(
    `${report.successful}/${report.iterations} successful (${report.failed} failed${report.degraded ? ", degraded" : ""})`
  );

  if (fmt.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    renderReport(report);
  }

  if (report.iterations > 0 && report.successful === 0) {
    process.exitCode = ExitCode.ERROR;
  }
}

// ── report ───────────────────────────────────────────────────────────────

interface ReportOptions {
  from?: string;
  to?: string;
}

async function handleReport(
  opts: ReportOptions,
  fmt: FormatOptions
): Promise<void> {
  const { from, to } = parseTimeRange(opts.from, opts.to);

  // Without probe_ids, query the last hour's events grouped by service
  // and surface the "probe" tagged events. We assume recent probes are
  // identifiable by their `probe_id` index in Analytics Engine, but for
  // v1 we just summarize recent service activity.
  const reader = new ObservabilityReader();
  const result = await reader.readProbeEvents({
    probeIds: [], // empty = all probe-tagged events
    from,
    to,
  });

  if (fmt.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (result.hops.length === 0) {
    process.stdout.write(
      `${theme.dim(`${icons.info}  No probe events found in the specified time range.`)}\n`
    );
    return;
  }

  const rows = result.hops.map((h) => {
    const s = summarize(h.samples);
    return {
      Service: h.service,
      Count: String(s.count),
      "p50 (ms)": s.p50.toFixed(1),
      "p95 (ms)": s.p95.toFixed(1),
      "p99 (ms)": s.p99.toFixed(1),
      "mean (ms)": s.mean.toFixed(1),
    };
  });
  formatTable(rows, fmt);
}

// ── tail ─────────────────────────────────────────────────────────────────

interface TailOptions {
  duration?: string;
  interval?: string;
  concurrency?: string;
}

async function handleTail(
  opts: TailOptions,
  fmt: FormatOptions
): Promise<void> {
  const durationSec = parseInt(opts.duration ?? "60", 10);
  const intervalMs = parseInt(opts.interval ?? "1000", 10);
  const concurrency = parseInt(opts.concurrency ?? "2", 10);

  if (durationSec > 600) {
    throw new CLIError(
      `--duration max is 600s, got ${durationSec}`,
      ExitCode.INVALID_USAGE
    );
  }

  const endAt = Date.now() + durationSec * 1000;
  const service = new FastPathService();
  let count = 0;

  process.stdout.write(
    theme.heading(
      `\nTailing fast path for ${durationSec}s (interval=${intervalMs}ms, concurrency=${concurrency})\n\n`
    )
  );

  while (Date.now() < endAt) {
    const batchStart = Date.now();
    const report = await service.run({ n: concurrency, concurrency });
    count += report.iterations;
    if (fmt.json) {
      process.stdout.write(JSON.stringify(report) + "\n");
    } else {
      process.stdout.write(
        `[${new Date().toISOString()}] ` +
          `n=${report.successful}/${report.iterations} ` +
          `p50=${report.total.p50}ms p95=${report.total.p95}ms\n`
      );
    }
    const elapsed = Date.now() - batchStart;
    const wait = Math.max(0, intervalMs - elapsed);
    if (wait > 0 && Date.now() + wait < endAt) {
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  formatSuccess(`Tailed ${count} probes over ${durationSec}s`, fmt);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function renderReport(report: FastPathReport): void {
  const lines: string[] = [];
  lines.push("");
  lines.push(theme.heading(`Total round-trip (CLI-measured)`));
  lines.push(
    `  p50: ${formatMs(report.total.p50)}    p95: ${formatMs(report.total.p95)}    p99: ${formatMs(report.total.p99)}    mean: ${formatMs(report.total.mean)}`
  );
  lines.push("");

  if (report.hops.length > 0) {
    lines.push(theme.heading(`Per-hop (from Workers Observability)`));
    const rows: Array<Record<string, string>> = report.hops.map((h) => ({
      Worker: h.service.padEnd(15),
      p50: formatMs(h.p50).padStart(6),
      p95: formatMs(h.p95).padStart(6),
      p99: formatMs(h.p99).padStart(6),
      count: String(h.count).padStart(5),
    }));
    lines.push(
      formatTableAsText(rows, ["Worker", "p50", "p95", "p99", "count"])
    );
  } else {
    lines.push(theme.dim("  (no per-hop data available)"));
  }

  if (report.bottleneck) {
    const totalP95 = report.total.p95;
    const hop = report.hops.find((h) => h.service === report.bottleneck);
    const share =
      hop && totalP95 > 0 ? Math.round((hop.p95 / totalP95) * 100) : 0;
    lines.push("");
    lines.push(
      theme.heading(`Bottleneck: ${report.bottleneck} (${share}% of p95)`)
    );
  }

  lines.push("");
  lines.push(
    theme.dim(
      `Window: ${new Date(report.window.from).toISOString()} → ${new Date(report.window.to).toISOString()}`
    )
  );
  process.stdout.write(lines.join("\n") + "\n");
}

function formatMs(n: number): string {
  if (n === 0) return "0ms";
  if (n < 1) return `${n.toFixed(1)}ms`;
  if (n < 10) return `${n.toFixed(1)}ms`;
  return `${Math.round(n)}ms`;
}

function formatTableAsText(
  rows: Array<Record<string, string>>,
  columns: string[]
): string {
  const out: string[] = [];
  for (const row of rows) {
    out.push(columns.map((c) => row[c] ?? "").join("  "));
  }
  return out.join("\n");
}

function parseTimeRange(
  fromStr: string | undefined,
  toStr: string | undefined
): { from: number; to: number } {
  const now = Date.now();
  const to = toStr ? parseTimeOrThrow(toStr, "to") : now;
  const from = fromStr
    ? parseTimeOrThrow(fromStr, "from")
    : now - 60 * 60 * 1000;
  return { from, to };
}

function parseTimeOrThrow(s: string, name: string): number {
  // Relative: "1h", "30m", "2d"
  const m = /^(\d+)([smhd])$/.exec(s);
  if (m) {
    const value = parseInt(m[1]!, 10);
    const unit = m[2]!;
    const mul: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return Date.now() - value * (mul[unit] ?? 1000);
  }
  // ISO-8601
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) {
    throw new CLIError(`Invalid ${name} time: "${s}"`, ExitCode.INVALID_USAGE);
  }
  return ms;
}

// ── Registration ─────────────────────────────────────────────────────────

export function registerFastpathCommand(program: Command): void {
  const cmd = program
    .command("fastpath")
    .summary("Measure the deployed fast-path latency (probe-based)")
    .description(
      `Send synthetic probes to the deployed hoox gateway and report p50/p95/p99
round-trip + per-hop latency (hoox → trade-worker → analytics-worker).

Probes carry a unique probe_id and are short-circuited by workers before any
real exchange call, so probing is safe to run against the live system.

Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID env vars (or
HOOX_GATEWAY_URL) for endpoint resolution and observability queries.

SUBCOMMANDS:
  run        Send N probes and report a percentile table (default)
  tail       Send probes for a fixed duration (continuous, Ctrl+C to stop)
  report     Query past probe events and report

EXAMPLES:
  hoox perf fastpath run --n 50
  hoox perf fastpath run --n 100 --concurrency 8
  hoox perf fastpath tail --duration 60
  hoox perf fastpath report --from 1h`
    );

  // run
  cmd
    .command("run")
    .summary("Send N probes and report percentiles")
    .description(
      `Send N synthetic probes (default 10) to the deployed hoox gateway and
report round-trip + per-hop latency as p50/p95/p99.

OPTIONS:
  --n <count>         Number of probes (default: 10, max: 1000)
  --concurrency <n>   Parallel probes (default: 4, max: 16)
  --symbol <s>        Synthetic symbol (default: BTCUSDT)
  --action <a>        LONG|SHORT (default: LONG)
  --quantity <n>      Synthetic quantity (default: 0.001)
  --timeout <ms>      Per-probe HTTP timeout (default: 5000)
  --api-key <key>     Internal auth key (default: WEBHOOK_API_KEY_BINDING env)

EXAMPLES:
  hoox perf fastpath run --n 50
  hoox perf fastpath run --n 100 --concurrency 8 --symbol ETHUSDT`
    )
    .option("--n <count>", "Number of probes (default: 10)", "10")
    .option("--concurrency <n>", "Parallel probes (default: 4)", "4")
    .option("--symbol <s>", "Synthetic symbol (default: BTCUSDT)", "BTCUSDT")
    .option("--action <a>", "LONG|SHORT (default: LONG)", "LONG")
    .option("--quantity <n>", "Synthetic quantity (default: 0.001)", "0.001")
    .option("--timeout <ms>", "Per-probe HTTP timeout (default: 5000)", "5000")
    .option(
      "--api-key <key>",
      "Internal auth key (env: WEBHOOK_API_KEY_BINDING)"
    )
    .action(
      withErrorHandling(
        async (options: RunOptions, sub: Command) => {
          const fmt = getFormatOptions(sub);
          await handleRun(options, fmt);
        },
        { service: "perf" }
      )
    );

  // tail
  cmd
    .command("tail")
    .summary("Send probes for a fixed duration (continuous)")
    .description(
      `Send probes at a fixed interval for the given duration. Prints rolling
percentiles per batch. Press Ctrl+C to stop early.

OPTIONS:
  --duration <sec>    Total duration (default: 60, max: 600)
  --interval <ms>     Gap between probe batches (default: 1000)
  --concurrency <n>   Parallel probes per batch (default: 2)

EXAMPLES:
  hoox perf fastpath tail --duration 60
  hoox perf fastpath tail --duration 300 --interval 500`
    )
    .option("--duration <sec>", "Total duration in seconds (default: 60)", "60")
    .option("--interval <ms>", "Gap between batches (default: 1000)", "1000")
    .option("--concurrency <n>", "Parallel probes per batch (default: 2)", "2")
    .action(
      withErrorHandling(
        async (options: TailOptions, sub: Command) => {
          const fmt = getFormatOptions(sub);
          await handleTail(options, fmt);
        },
        { service: "perf" }
      )
    );

  // report
  cmd
    .command("report")
    .summary("Query past probe events and report")
    .description(
      `Query Cloudflare Workers Observability for past probe events and report
per-hop latency over the time range.

OPTIONS:
  --from <time>       Start time (ISO-8601 or relative: 1h, 30m, 2d; default: 1h ago)
  --to <time>         End time (ISO-8601 or relative; default: now)

EXAMPLES:
  hoox perf fastpath report
  hoox perf fastpath report --from 30m
  hoox perf fastpath report --from 2026-06-21T10:00:00Z --to 2026-06-21T11:00:00Z`
    )
    .option("--from <time>", "Start time (ISO-8601 or relative)")
    .option("--to <time>", "End time (ISO-8601 or relative)")
    .action(
      withErrorHandling(
        async (options: ReportOptions, sub: Command) => {
          const fmt = getFormatOptions(sub);
          await handleReport(options, fmt);
        },
        { service: "perf" }
      )
    );
}
