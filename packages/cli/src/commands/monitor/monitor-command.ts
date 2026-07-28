/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "commander";
import { DbService } from "../../services/db/index.js";
import { KvSyncService } from "../../services/kv/kv-sync-service.js";
import {
  formatSuccess,
  formatError,
  formatTable,
  getFormatOptions,
} from "../../utils/formatters.js";
import type { FormatOptions } from "../../utils/formatters.js";
import { ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { theme } from "../../utils/theme.js";

function assertSafeInteger(value: number, name: string, max: number): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > max ||
    !Number.isSafeInteger(value)
  ) {
    throw new Error(
      `Invalid ${name}: ${value} (must be a non-negative integer ≤ ${max})`
    );
  }
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

async function doMonitorTrades(
  limit: number,
  fmt: FormatOptions
): Promise<void> {
  try {
    assertSafeInteger(limit, "limit", 100);
    const db = new DbService();
    const dbName = await db.resolveDbName();
    const sql = `SELECT * FROM trades ORDER BY timestamp DESC LIMIT ${limit}`;
    const output = await db.query(dbName, sql, true);
    process.stdout.write(output + "\n");
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function doMonitorLogs(
  workerName: string | undefined,
  fmt: FormatOptions
): Promise<void> {
  try {
    const db = new DbService();
    const dbName = await db.resolveDbName();
    let sql: string;
    if (workerName) {
      // Worker names are alphanumeric with hyphens/underscores only — validate strictly
      if (!/^[a-zA-Z0-9_-]+$/.test(workerName)) {
        throw new Error(`Invalid worker name: "${workerName}"`);
      }
      sql = `SELECT * FROM system_logs WHERE worker = '${escapeSqlString(workerName)}' ORDER BY timestamp DESC LIMIT 20`;
    } else {
      sql = "SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 20";
    }
    const output = await db.query(dbName, sql, true);
    process.stdout.write(output + "\n");
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function doMonitorKillSwitch(
  action: "show" | "on" | "off",
  fmt: FormatOptions
): Promise<void> {
  try {
    const kv = new KvSyncService();
    const namespaceId = await kv.resolveNamespaceId();
    const key = "trade:kill_switch";

    if (action === "show") {
      const value = await kv.get(namespaceId, key);
      const status =
        value === "true"
          ? "KILL SWITCH IS ON (trading halted)"
          : value === "false"
            ? "Kill switch is off (trading active)"
            : `Kill switch value: ${value ?? "(not set)"}`;
      process.stdout.write(`${theme.info(status)}\n`);
    } else {
      const newValue = action === "on" ? "true" : "false";
      await kv.set(namespaceId, key, newValue);
      formatSuccess(
        `Kill switch turned ${action === "on" ? "ON" : "OFF"}`,
        fmt
      );
    }
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

interface WranglerQueueInfo {
  queue_id?: string;
  queue_name?: string;
  producers_total_count?: number;
  consumers_total_count?: number;
  settings?: {
    delivery_paused?: boolean;
    message_retention_period?: number;
  };
  modified_on?: string;
  created_on?: string;
}

/**
 * Normalize wrangler/CF queue JSON (bare array or `{ result: [...] }` envelope).
 * Kept for callers that already have structured JSON (tests, future API path).
 */
export function parseWranglerQueuesJson(raw: string): WranglerQueueInfo[] {
  const cleaned = raw.trim();
  if (!cleaned) return [];
  // Wrangler often prefixes version banners before the JSON payload.
  const firstBracket = cleaned.indexOf("[");
  const firstBrace = cleaned.indexOf("{");
  const start =
    firstBracket === -1
      ? firstBrace
      : firstBrace === -1
        ? firstBracket
        : Math.min(firstBracket, firstBrace);
  const payload = start >= 0 ? cleaned.slice(start) : cleaned;
  const parsed: unknown = JSON.parse(payload);
  if (Array.isArray(parsed)) {
    return parsed as WranglerQueueInfo[];
  }
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "result" in parsed &&
    Array.isArray((parsed as { result: unknown }).result)
  ) {
    return (parsed as { result: WranglerQueueInfo[] }).result;
  }
  return [];
}

/**
 * Parse `wrangler queues list` human table output into structured rows.
 *
 * wrangler ≥4.x removed `queues list --json`, so structured consumers must
 * parse the ASCII table (or call the CF API directly).
 */
export function parseWranglerQueuesTable(raw: string): WranglerQueueInfo[] {
  const queues: WranglerQueueInfo[] = [];
  for (const line of raw.split("\n")) {
    if (!line.includes("│")) continue;
    // Skip box-drawing border / separator rows
    if (/[┌└├─┬┴┼]/.test(line)) continue;
    const cells = line
      .split("│")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    // Skip header
    if (cells[0] === "id" || cells[0] === "name") continue;
    // Data rows start with a queue id (UUID / hex)
    if (!/^[0-9a-f-]{16,}$/i.test(cells[0])) continue;
    const producers =
      cells[4] !== undefined && cells[4] !== "" ? Number(cells[4]) : undefined;
    const consumers =
      cells[5] !== undefined && cells[5] !== "" ? Number(cells[5]) : undefined;
    queues.push({
      queue_id: cells[0],
      queue_name: cells[1],
      created_on: cells[2],
      modified_on: cells[3],
      producers_total_count: Number.isFinite(producers) ? producers : undefined,
      consumers_total_count: Number.isFinite(consumers) ? consumers : undefined,
    });
  }
  return queues;
}

async function doMonitorQueueDepth(fmt: FormatOptions): Promise<void> {
  try {
    // wrangler ≥4.x does not support `queues list --json` (Unknown argument: json).
    // Always use the table form and parse it when --json is requested.
    const proc = Bun.spawn(["wrangler", "queues", "list"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || `wrangler exited with code ${exitCode}`);
    }

    if (fmt.json) {
      // Prefer JSON parse if wrangler ever emits JSON again; otherwise table.
      let queues: WranglerQueueInfo[];
      try {
        queues = parseWranglerQueuesJson(stdout);
        if (queues.length === 0) {
          queues = parseWranglerQueuesTable(stdout);
        }
      } catch {
        queues = parseWranglerQueuesTable(stdout);
      }
      process.stdout.write(JSON.stringify({ queues }, null, 2) + "\n");
      return;
    }

    process.stdout.write(stdout + "\n");
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function doMonitorAnalyticsSummary(fmt: FormatOptions): Promise<void> {
  try {
    const db = new DbService();
    const dbName = await db.resolveDbName();
    const sql =
      "SELECT COUNT(*) as total_events, MIN(timestamp) as earliest, MAX(timestamp) as latest FROM system_logs";
    const output = await db.query(dbName, sql, true);

    if (fmt.json) {
      process.stdout.write(output + "\n");
      return;
    }

    const parsed = JSON.parse(output);
    const results = parsed[0]?.results;
    if (results && results.length > 0) {
      const row = results[0];
      const rows = [
        {
          "Total Events": String(row.total_events ?? "-"),
          Earliest: String(row.earliest ?? "-"),
          Latest: String(row.latest ?? "-"),
        },
      ];
      formatTable(rows, fmt);
    } else {
      process.stdout.write("No analytics data found.\n");
    }
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function doMonitorAnalyticsErrors(
  hours: number,
  fmt: FormatOptions
): Promise<void> {
  try {
    assertSafeInteger(hours, "hours", 8760);
    const db = new DbService();
    const dbName = await db.resolveDbName();
    const sql = `SELECT level, COUNT(*) as count FROM system_logs WHERE level IN ('error', 'warn') AND timestamp > unixepoch('now', '-${hours} hours') GROUP BY level`;
    const output = await db.query(dbName, sql, true);

    if (fmt.json) {
      process.stdout.write(output + "\n");
      return;
    }

    const parsed = JSON.parse(output);
    const results = parsed[0]?.results;
    if (results && results.length > 0) {
      const rows = results.map((r: Record<string, unknown>) => ({
        Level: String(r.level ?? "-"),
        Count: String(r.count ?? "0"),
      }));
      formatTable(rows, fmt);
    } else {
      process.stdout.write(
        `No errors or warnings in the last ${hours} hours.\n`
      );
    }
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

async function doMonitorBackup(fmt: FormatOptions): Promise<void> {
  try {
    const db = new DbService();
    const dbName = await db.resolveDbName();
    const outputPath = await db.export(dbName);
    formatSuccess(`Database exported to ${outputPath}`, fmt);
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

export function registerMonitorCommand(program: Command): void {
  const monitorCmd = program
    .command("monitor")
    .summary("Monitor and operate the trading system")
    .description(
      `Monitor worker health, trades, logs, and perform operational tasks.

SUBCOMMANDS:
  trades [N]      Show N most recent trades (default: 10)
  logs [worker]   Show recent system logs from D1
  kill-switch     Emergency stop/resume trading
  queue-depth     List queues and pending messages
  backup          Export D1 database to timestamped .sql file
  analytics       Query analytics data from D1

EXAMPLES:
  hoox monitor trades 20               Show 20 recent trades
  hoox monitor logs hoox               Show logs for hoox worker
  hoox monitor kill-switch show        Check kill switch status
  hoox monitor kill-switch on          Halt all trading
  hoox monitor kill-switch off         Resume trading
  hoox monitor queue-depth             Show queue info
  hoox monitor backup                  Export D1 database
  hoox monitor analytics summary       Show event rollup statistics
  hoox monitor analytics errors        Show error/warning counts`
    );

  monitorCmd
    .command("trades")
    .summary("Show recent trades from D1")
    .description("Query the trades table for the most recent entries.")
    .argument(
      "[limit]",
      "Number of trades to show (default: 10, max: 100)",
      "10"
    )
    .action(
      withErrorHandling(
        async (limit: string, _, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doMonitorTrades(parseInt(limit, 10) || 10, fmt);
        },
        { service: "monitor" }
      )
    );

  monitorCmd
    .command("logs")
    .summary("Show recent system logs from D1")
    .description(
      "Query the system_logs table. Optionally filter by worker name."
    )
    .argument("[worker]", "Worker name to filter (optional)")
    .action(
      withErrorHandling(
        async (worker: string | undefined, _, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doMonitorLogs(worker, fmt);
        },
        { service: "monitor" }
      )
    );

  const ksCmd = monitorCmd
    .command("kill-switch")
    .summary("Emergency stop or resume trading")
    .description(
      `Control the trade:kill_switch KV key.

Commands:
  show   Display current kill switch status
  on     Halt all trading (set kill_switch=true)
  off    Resume trading (set kill_switch=false)`
    );

  ksCmd
    .command("show")
    .summary("Show kill switch status")
    .description("Display whether trading is halted or active.")
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doMonitorKillSwitch("show", fmt);
        },
        { service: "monitor" }
      )
    );

  ksCmd
    .command("on")
    .summary("Halt all trading")
    .description(
      "Set trade:kill_switch=true to stop all trading operations. WARNING: This halts ALL trading activity immediately."
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doMonitorKillSwitch("on", fmt);
        },
        { service: "monitor" }
      )
    );

  ksCmd
    .command("off")
    .summary("Resume trading")
    .description(
      "Set trade:kill_switch=false to resume normal trading operations."
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doMonitorKillSwitch("off", fmt);
        },
        { service: "monitor" }
      )
    );

  monitorCmd
    .command("queue-depth")
    .summary("Show queue details")
    .description(
      "List queues via wrangler queues list to show configured queues."
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doMonitorQueueDepth(fmt);
        },
        { service: "monitor" }
      )
    );

  monitorCmd
    .command("backup")
    .summary("Export D1 database to .sql file")
    .description(
      "Export the D1 database to a timestamped .sql backup file via wrangler d1 export."
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doMonitorBackup(fmt);
        },
        { service: "monitor" }
      )
    );

  const analyticsCmd = monitorCmd
    .command("analytics")
    .summary("Query analytics data from D1")
    .description(
      `Run analytical queries against the system_logs table.

SUBCOMMANDS:
  summary       Show rollup statistics of system events
  errors        Show error/warning counts by level`
    );

  analyticsCmd
    .command("summary")
    .summary("Show event rollup statistics")
    .description(
      "Query system_logs for total events, earliest and latest timestamps."
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doMonitorAnalyticsSummary(fmt);
        },
        { service: "monitor" }
      )
    );

  analyticsCmd
    .command("errors")
    .summary("Show error and warning counts by level")
    .description(
      "Query system_logs for error/warning counts grouped by level, filtered by hours."
    )
    .option("--hours <n>", "Hours to look back (default: 24)", "24")
    .action(
      withErrorHandling(
        async (options: { hours?: string }, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          const hours = parseInt(options.hours ?? "24", 10) || 24;
          await doMonitorAnalyticsErrors(hours, fmt);
        },
        { service: "monitor" }
      )
    );
}
