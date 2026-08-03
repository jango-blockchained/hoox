/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox logs` command group — real-time log tailing for Cloudflare Workers.
 *
 * Subcommands:
 *   worker <name>  — Tail logs for a specific worker
 *   all            — Tail logs from all enabled workers concurrently
 *
 * Uses Bun.spawn to run `wrangler tail` with streaming output.
 * Supports --level (log/info/warn/error), --follow/--no-follow, and --json flags.
 */

import { Command } from "commander";
import { ConfigService } from "../../services/config/index.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import {
  formatError,
  formatSuccess,
  getFormatOptions,
} from "../../utils/formatters.js";
import { theme } from "../../utils/theme.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import type { FormatOptions } from "../../utils/formatters.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid log levels for filtering */
const VALID_LEVELS = ["log", "info", "warn", "error", "debug", "all"] as const;
type LogLevel = (typeof VALID_LEVELS)[number];

interface WorkerLogOptions {
  level: LogLevel;
  follow: boolean;
  json: boolean;
}

interface WranglerLogEntry {
  outcome: string;
  scriptName?: string;
  logs?: Array<{
    message: string[];
    level: string;
    timestamp: number;
  }>;
  exceptions?: Array<{
    name: string;
    message: string;
  }>;
  eventTimestamp?: number;
  event?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate and normalize the log level string.
 * Defaults to "all" for unknown values.
 */
function normalizeLevel(raw: string): LogLevel {
  const lower = raw.toLowerCase();
  if (VALID_LEVELS.includes(lower as LogLevel)) {
    return lower as LogLevel;
  }
  return "all";
}

/**
 * Check whether a log entry matches the requested level filter.
 * "all" matches everything; otherwise, the entry's level must equal the filter.
 */
function matchesLevel(entry: WranglerLogEntry, level: LogLevel): boolean {
  if (level === "all") return true;
  const entryLogs = entry.logs ?? [];
  return entryLogs.some((l) => l.level === level);
}

/**
 * Format a single JSON log line from wrangler for human-readable output.
 * Extracts timestamp, level, and message fields.
 */
function formatLogLine(entry: WranglerLogEntry): string {
  const timestamp = entry.eventTimestamp
    ? new Date(entry.eventTimestamp).toISOString()
    : new Date().toISOString();

  const logs = entry.logs ?? [];
  if (logs.length === 0) {
    // Non-log events (e.g. request outcome)
    return theme.dim(`[${timestamp}]`) + ` ${entry.outcome}`;
  }

  const parts = logs.map((l) => {
    const levelColor =
      l.level === "error"
        ? theme.error
        : l.level === "warn"
          ? theme.warning
          : l.level === "info"
            ? theme.info
            : theme.dim;
    const msg = l.message.join(" ");
    return `${theme.dim(`[${timestamp}]`)} ${levelColor(`[${l.level.toUpperCase()}]`)} ${msg}`;
  });

  return parts.join("\n");
}

/**
 * Parse a line from wrangler tail --format json output.
 * Returns null if the line is not valid JSON.
 */
function parseLogLine(line: string): WranglerLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as WranglerLogEntry;
  } catch {
    // Non-JSON lines are passed through as-is (e.g. wrangler status messages)
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tail implementation
// ---------------------------------------------------------------------------

/**
 * Tail logs for a single worker using wrangler.
 *
 * Spawns `wrangler tail <workerName>` and streams stdout to the terminal.
 * With --follow (default), runs until interrupted (Ctrl+C).
 * With --no-follow, captures output for 5 seconds then exits.
 * With --level, filters JSON log entries by log level.
 * With --json, passes through wrangler's JSON output directly.
 */
async function tailWorker(
  workerName: string,
  opts: WorkerLogOptions,
  fmt: FormatOptions
): Promise<void> {
  const wranglerArgs = ["wrangler", "tail", workerName];

  // Use JSON format when level filtering or --json output is requested
  if (opts.level !== "all" || opts.json) {
    wranglerArgs.push("--format", "json");
  }

  let proc: Bun.Subprocess | null = null;

  try {
    proc = Bun.spawn(wranglerArgs, {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (!proc.stdout || typeof proc.stdout === "number") {
      throw new CLIError(
        "Failed to get stdout stream from wrangler tail",
        ExitCode.ERROR
      );
    }

    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const readLoop = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          if (opts.level !== "all" || opts.json) {
            const entry = parseLogLine(line);

            if (entry !== null) {
              // JSON parse succeeded
              if (!matchesLevel(entry, opts.level)) continue;

              if (opts.json) {
                process.stdout.write(JSON.stringify(entry) + "\n");
              } else {
                process.stdout.write(formatLogLine(entry) + "\n");
              }
            } else {
              // Non-JSON line (wrangler status message) — pass through
              if (opts.level === "all") {
                process.stdout.write(line + "\n");
              }
            }
          } else {
            // Raw pass-through mode
            process.stdout.write(line + "\n");
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        process.stdout.write(buffer + "\n");
      }
    };

    if (opts.follow) {
      // Continuous streaming — run until interrupted
      await readLoop();
    } else {
      // Show recent and exit after a short timeout
      const timeout = 5000;
      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(resolve, timeout)
      );

      await Promise.race([readLoop(), timeoutPromise]);

      // Kill the wrangler process after timeout
      if (proc && !proc.killed) {
        proc.kill();
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    formatError(
      new CLIError(
        `Failed to tail logs for "${workerName}": ${message}`,
        ExitCode.ERROR
      ),
      fmt
    );
    process.exitCode = ExitCode.ERROR;
  } finally {
    // Ensure the process is killed on cleanup
    if (proc && !proc.killed) {
      proc.kill();
    }
  }
}

/**
 * Tail logs for all enabled workers concurrently.
 *
 * Loads ConfigService.listEnabledWorkers(), spawns a tail process for each,
 * and prefixes output with the worker name.
 */
async function tailAllWorkers(
  opts: WorkerLogOptions,
  fmt: FormatOptions
): Promise<void> {
  const configService = new ConfigService();
  await configService.load();
  const workers = configService.listEnabledWorkers();

  if (workers.length === 0) {
    formatSuccess("No enabled workers found to tail", fmt);
    return;
  }

  const wranglerArgsBase = ["wrangler", "tail"];
  if (opts.level !== "all" || opts.json) {
    wranglerArgsBase.push("--format", "json");
  }

  const processes: Array<{
    name: string;
    proc: Bun.Subprocess;
    reader: ReadableStreamDefaultReader<Uint8Array>;
  }> = [];

  try {
    // Spawn a tail process for each worker
    for (const workerName of workers) {
      const proc = Bun.spawn(
        ["wrangler", "tail", workerName, ...wranglerArgsBase.slice(2)],
        {
          stdout: "pipe",
          stderr: "pipe",
        }
      );
      processes.push({
        name: workerName,
        proc,
        reader: proc.stdout.getReader(),
      });
    }

    // Read from all workers concurrently, prefixing with worker name
    const decoder = new TextDecoder();

    const readFromWorker = async (p: (typeof processes)[0]) => {
      let buffer = "";
      while (true) {
        const { done, value } = await p.reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const prefix = theme.bold(`[${p.name}]`);

          if (opts.level !== "all" || opts.json) {
            const entry = parseLogLine(line);
            if (entry !== null) {
              if (!matchesLevel(entry, opts.level)) continue;
              if (opts.json) {
                process.stdout.write(
                  JSON.stringify({ worker: p.name, ...entry }) + "\n"
                );
              } else {
                process.stdout.write(`${prefix} ${formatLogLine(entry)}\n`);
              }
            } else if (opts.level === "all") {
              process.stdout.write(`${prefix} ${line}\n`);
            }
          } else {
            process.stdout.write(`${prefix} ${line}\n`);
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        process.stdout.write(`${theme.bold(`[${p.name}]`)} ${buffer}\n`);
      }
    };

    if (opts.follow) {
      // Run all readers concurrently until interrupted
      await Promise.all(processes.map((p) => readFromWorker(p)));
    } else {
      // Show recent and exit after timeout
      const timeout = 5000;
      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(resolve, timeout)
      );

      await Promise.race([
        Promise.all(processes.map((p) => readFromWorker(p))),
        timeoutPromise,
      ]);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    formatError(
      new CLIError(`Failed to tail workers: ${message}`, ExitCode.ERROR),
      fmt
    );
    process.exitCode = ExitCode.ERROR;
  } finally {
    // Kill all processes on cleanup
    for (const p of processes) {
      if (!p.proc.killed) {
        p.proc.kill();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `hoox logs` command group with subcommands:
 * worker <name> and all.
 */
export function registerLogsCommand(program: Command): void {
  const logsCmd = program
    .command("logs")
    .description("Tail and view Cloudflare Worker logs in real-time");

  // -- logs worker <name> ---------------------------------------------------
  logsCmd
    .command("worker <name>")
    .description("Tail logs for a specific Cloudflare Worker")
    .option(
      "--level <level>",
      "Filter by log level (log, info, warn, error, debug, all)",
      "all"
    )
    .option("--follow", "Continuously stream logs (default)", true)
    .option("--no-follow", "Show recent logs and exit after 5 seconds")
    .option("--json", "Output logs in JSON format")
    .action(
      withErrorHandling(
        async (
          name: string,
          options: { level?: string; follow?: boolean; json?: boolean },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          const workerOpts: WorkerLogOptions = {
            level: normalizeLevel(options.level ?? "all"),
            follow: options.follow !== false, // --no-follow sets follow to false
            json: Boolean(options.json),
          };

          try {
            await tailWorker(name, workerOpts, fmt);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            formatError(message, fmt);
            process.exitCode = ExitCode.ERROR;
          }
        },
        { service: "logs" }
      )
    );

  // -- logs all -------------------------------------------------------------
  logsCmd
    .command("all")
    .description("Tail logs from all enabled workers concurrently")
    .option(
      "--level <level>",
      "Filter by log level (log, info, warn, error, debug, all)",
      "all"
    )
    .option("--follow", "Continuously stream logs (default)", true)
    .option("--no-follow", "Show recent logs and exit after 5 seconds")
    .option("--json", "Output logs in JSON format")
    .action(
      withErrorHandling(
        async (
          options: { level?: string; follow?: boolean; json?: boolean },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          const workerOpts: WorkerLogOptions = {
            level: normalizeLevel(options.level ?? "all"),
            follow: options.follow !== false,
            json: Boolean(options.json),
          };

          try {
            await tailAllWorkers(workerOpts, fmt);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            formatError(message, fmt);
            process.exitCode = ExitCode.ERROR;
          }
        },
        { service: "logs" }
      )
    );
}
