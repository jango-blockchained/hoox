/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox trace` command group — Cloudflare Workers Observability trace management.
 *
 * Subcommands:
 *   trace events              Query trace events (spans) with filters
 *   trace metrics             Calculate trace metrics (p99, avg, counts)
 *   trace live                Live tail traces in real-time
 *   trace keys                List available filter keys
 *   trace values <key>        List values for a filter key
 *   trace destinations        List OTLP export destinations
 *   trace destinations add    Add an OTLP export destination
 *   trace destinations remove Remove an OTLP destination
 *   trace usage               Show trace event count/usage
 *
 * Uses the Cloudflare Workers Observability API (beta) for automatic tracing.
 */

import type { Command } from "commander";
import { TraceService } from "./trace-service.js";
import type {
  TraceEvent,
  TraceDestination,
  TraceDestinationInput,
} from "./types.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import {
  formatSuccess,
  formatTable,
  getFormatOptions,
} from "../../utils/formatters.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { theme, icons } from "../../utils/theme.js";
import type { FormatOptions } from "../../utils/formatters.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a time string (ISO-8601 or relative like "1h", "30m") to a Unix
 * timestamp in **milliseconds** (number). This matches the format expected
 * by the Cloudflare Observability API — sending an ISO string causes HTTP 400.
 */
function parseTime(input: string | undefined): number | undefined {
  if (!input) return undefined;

  // Relative time: "1h", "30m", "2d"
  const relativeMatch = input.match(/^(\d+)([smhd])$/);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return Date.now() - value * multipliers[unit];
  }

  // Assume ISO-8601 → Unix ms
  const ms = new Date(input).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Format a trace event for human-readable output.
 */
function formatTraceEvent(event: TraceEvent): string {
  const meta = event.$metadata;
  const timestamp = meta.timestamp
    ? new Date(meta.timestamp).toISOString().slice(11, 23)
    : "—";
  const service = meta.service ?? "—";
  const trigger = meta.trigger ?? meta.origin ?? "—";
  const level = meta.level ?? "—";
  const message = meta.message ?? "";
  const error = meta.error;

  const levelColor =
    level === "error"
      ? theme.error
      : level === "warn"
        ? theme.warning
        : level === "info"
          ? theme.info
          : theme.dim;

  const parts = [
    theme.dim(`[${timestamp}]`),
    theme.accent(service.padEnd(20)),
    levelColor(`[${level.toUpperCase().padEnd(5)}]`),
    theme.dim(trigger.padEnd(30)),
  ];

  if (message) {
    parts.push(message);
  }

  if (error) {
    parts.push(theme.error(`ERROR: ${error}`));
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Command action: trace events
// ---------------------------------------------------------------------------

async function handleEvents(
  options: {
    service?: string;
    trigger?: string;
    level?: string;
    limit?: number;
    from?: string;
    to?: string;
  },
  fmt: FormatOptions
): Promise<void> {
  const service = new TraceService();

  const result = await service.queryEvents({
    service: options.service,
    trigger: options.trigger,
    level: options.level,
    limit: options.limit ?? 50,
    from: parseTime(options.from),
    to: parseTime(options.to),
  });

  if (fmt.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const events = result.events ?? [];

  if (events.length === 0) {
    process.stdout.write(
      `${theme.dim(`${icons.info}  No trace events found in the specified time range.`)}\n`
    );
    return;
  }

  process.stdout.write(
    theme.heading(`\nTrace Events (${events.length} events)\n\n`)
  );

  for (const event of events) {
    process.stdout.write(formatTraceEvent(event) + "\n");
  }

  if (result.nextOffset) {
    process.stdout.write(
      `\n${theme.dim(`More events available. Use --offset ${result.nextOffset} to paginate.`)}\n`
    );
  }
}

// ---------------------------------------------------------------------------
// Command action: trace metrics
// ---------------------------------------------------------------------------

async function handleMetrics(
  options: {
    service?: string;
    operator?: string;
    key?: string;
    groupBy?: string;
    from?: string;
    to?: string;
  },
  fmt: FormatOptions
): Promise<void> {
  const service = new TraceService();

  const calculations = options.operator
    ? [
        {
          operator: options.operator,
          key: options.key,
          alias: options.key ?? options.operator,
        },
      ]
    : [{ operator: "count" }];

  const result = await service.queryMetrics({
    service: options.service,
    calculations,
    groupBy: options.groupBy,
    from: parseTime(options.from),
    to: parseTime(options.to),
  });

  if (fmt.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const metrics = result.metrics ?? [];

  if (metrics.length === 0) {
    process.stdout.write(
      `${theme.dim(`${icons.info}  No metrics found in the specified time range.`)}\n`
    );
    return;
  }

  process.stdout.write(theme.heading(`\nTrace Metrics\n\n`));

  if (options.groupBy) {
    // Grouped metrics — show as table
    const rows = metrics.map((m) => {
      const row: Record<string, string> = {};
      if (m.groupBy) {
        for (const [k, v] of Object.entries(m.groupBy)) {
          row[k] = String(v);
        }
      }
      for (const calc of m.calculations) {
        row[calc.alias] = String(calc.value);
      }
      return row;
    });
    formatTable(rows, fmt);
  } else {
    // Single aggregate — show as key-value
    for (const metric of metrics) {
      for (const calc of metric.calculations) {
        process.stdout.write(
          `  ${theme.key(calc.alias.padEnd(20))} ${theme.value(String(calc.value))}\n`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Command action: trace keys
// ---------------------------------------------------------------------------

async function handleKeys(
  options: { needle?: string; limit?: number },
  fmt: FormatOptions
): Promise<void> {
  const service = new TraceService();
  const result = await service.listKeys({
    needle: options.needle,
    limit: options.limit ?? 100,
  });

  if (fmt.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const keys = result.keys ?? [];

  if (keys.length === 0) {
    process.stdout.write(
      `${theme.dim(`${icons.info}  No filter keys found.`)}\n`
    );
    return;
  }

  process.stdout.write(
    theme.heading(`\nAvailable Filter Keys (${keys.length})\n\n`)
  );

  const rows = keys.map((k) => ({
    Key: k.key,
    Type: k.type,
    Description: k.description ?? "—",
  }));

  formatTable(rows, fmt);
}

// ---------------------------------------------------------------------------
// Command action: trace values
// ---------------------------------------------------------------------------

async function handleValues(
  key: string,
  options: { type?: string; limit?: number; from?: string; to?: string },
  fmt: FormatOptions
): Promise<void> {
  const service = new TraceService();
  const result = await service.listValues({
    key,
    type: (options.type as "string" | "number" | "boolean") ?? "string",
    limit: options.limit ?? 50,
    from: parseTime(options.from),
    to: parseTime(options.to),
  });

  if (fmt.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const values = result.values ?? [];

  if (values.length === 0) {
    process.stdout.write(
      `${theme.dim(`${icons.info}  No values found for key "${key}".`)}\n`
    );
    return;
  }

  process.stdout.write(
    theme.heading(`\nValues for "${key}" (${values.length})\n\n`)
  );

  for (const v of values) {
    process.stdout.write(`  ${theme.value(String(v))}\n`);
  }
}

// ---------------------------------------------------------------------------
// Command action: trace destinations
// ---------------------------------------------------------------------------

async function handleDestinationsList(fmt: FormatOptions): Promise<void> {
  const service = new TraceService();
  const destinations = await service.listDestinations();

  if (fmt.json) {
    process.stdout.write(JSON.stringify(destinations, null, 2) + "\n");
    return;
  }

  if (destinations.length === 0) {
    process.stdout.write(
      `${theme.dim(`${icons.info}  No OTLP destinations configured.`)}\n`
    );
    return;
  }

  process.stdout.write(
    theme.heading(`\nOTLP Export Destinations (${destinations.length})\n\n`)
  );

  const rows = destinations.map((d: TraceDestination) => ({
    Slug: d.slug,
    Name: d.name,
    Type: d.type,
    URL: d.url ?? "—",
    Enabled: d.enabled ? `${icons.success} Yes` : `${icons.error} No`,
  }));

  formatTable(rows, fmt);
}

// ---------------------------------------------------------------------------
// Command action: trace destinations add
// ---------------------------------------------------------------------------

async function handleDestinationsAdd(
  name: string,
  url: string,
  options: { headers?: string },
  fmt: FormatOptions
): Promise<void> {
  const service = new TraceService();

  let headers: Record<string, string> | undefined;
  if (options.headers) {
    try {
      headers = JSON.parse(options.headers);
    } catch {
      throw new CLIError(
        'Invalid JSON for --headers. Use format: \'{"Authorization":"Bearer token"}\'',
        ExitCode.INVALID_USAGE
      );
    }
  }

  const input: TraceDestinationInput = {
    name,
    type: "otlp",
    url,
    headers,
  };

  const destination = await service.createDestination(input);

  if (fmt.json) {
    process.stdout.write(JSON.stringify(destination, null, 2) + "\n");
    return;
  }

  formatSuccess(
    `OTLP destination "${destination.name}" created (slug: ${destination.slug})`,
    fmt
  );
}

// ---------------------------------------------------------------------------
// Command action: trace destinations remove
// ---------------------------------------------------------------------------

async function handleDestinationsRemove(
  slug: string,
  fmt: FormatOptions
): Promise<void> {
  const service = new TraceService();
  await service.deleteDestination(slug);
  formatSuccess(`OTLP destination "${slug}" deleted`, fmt);
}

// ---------------------------------------------------------------------------
// Command action: trace usage
// ---------------------------------------------------------------------------

async function handleUsage(fmt: FormatOptions): Promise<void> {
  const service = new TraceService();
  const usage = await service.getUsage();

  if (fmt.json) {
    process.stdout.write(JSON.stringify(usage, null, 2) + "\n");
    return;
  }

  process.stdout.write(theme.heading(`\nObservability Usage\n\n`));
  process.stdout.write(
    `  ${theme.key("Event Count".padEnd(20))} ${theme.value(String(usage.eventCount))}\n`
  );

  if (usage.from && usage.to) {
    process.stdout.write(
      `  ${theme.key("Time Range".padEnd(20))} ${theme.dim(usage.from)} → ${theme.dim(usage.to)}\n`
    );
  }

  if (usage.byWorker) {
    process.stdout.write(`\n  ${theme.heading("By Worker:")}\n`);
    const entries = Object.entries(usage.byWorker).sort(
      ([, a], [, b]) => b - a
    );
    for (const [worker, count] of entries) {
      process.stdout.write(
        `    ${theme.accent(worker.padEnd(25))} ${theme.value(String(count))}\n`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Command action: trace live
// ---------------------------------------------------------------------------

async function handleLive(options: {
  service?: string;
  duration?: number;
}): Promise<void> {
  const service = new TraceService();

  process.stdout.write(theme.heading(`\nLive Trace Tail\n\n`));
  process.stdout.write(
    `${theme.dim("Streaming traces... Press Ctrl+C to stop.\n\n")}`
  );

  // Prepare live tail session
  const session = await service.prepareLiveTail({
    service: options.service,
  });

  const durationMs = (options.duration ?? 60) * 1000;
  const startTime = Date.now();
  let lastHeartbeat = Date.now();

  // Poll for events (simplified implementation — real implementation would use WebSocket)
  const pollInterval = 2000; // 2 seconds

  const poll = async (): Promise<void> => {
    const elapsed = Date.now() - startTime;
    if (elapsed >= durationMs) {
      process.stdout.write(
        `\n${theme.dim("Live tail duration reached. Exiting.")}\n`
      );
      return;
    }

    // Send heartbeat every 30 seconds
    if (Date.now() - lastHeartbeat > 30000) {
      try {
        await service.liveTailHeartbeat(session.sessionId);
        lastHeartbeat = Date.now();
      } catch {
        // Heartbeat failed — session may have expired
        process.stdout.write(
          `${theme.warning("Warning: Live tail session expired. Exiting.")}\n`
        );
        return;
      }
    }

    // Query recent events
    try {
      const result = await service.queryEvents({
        service: options.service,
        limit: 10,
        from: Date.now() - 5000, // Last 5 seconds (Unix ms)
      });

      const events = result.events ?? [];
      for (const event of events) {
        process.stdout.write(formatTraceEvent(event) + "\n");
      }
    } catch {
      // Query failed — continue polling
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    await poll();
  };

  await poll();
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `hoox trace` command group with all subcommands.
 */
export function registerTraceCommand(program: Command): void {
  const traceCmd = program
    .command("trace")
    .summary("Query and manage Cloudflare Workers traces (beta)")
    .description(
      `Query and manage Cloudflare Workers automatic traces (beta).

Workers automatic tracing captures telemetry data for fetch calls, binding calls
(KV, R2, Durable Objects), and handler lifecycle — no code changes required.

SUBCOMMANDS:
  events              Query trace events (spans) with filters
  metrics             Calculate trace metrics (p99, avg, counts)
  live                Live tail traces in real-time
  keys                List available filter keys
  values <key>        List values for a filter key
  destinations        List OTLP export destinations
  destinations add    Add an OTLP export destination
  destinations remove Remove an OTLP destination
  usage               Show trace event count/usage

EXAMPLES:
  hoox trace events                              Recent trace events
  hoox trace events --service trade-worker       Events for specific worker
  hoox trace events --level error                Error events only
  hoox trace events --from 1h                    Events from last hour
  hoox trace metrics                             Count of all events
  hoox trace metrics --operator p99 --key duration.ms   P99 latency
  hoox trace metrics --groupBy $metadata.service        Group by worker
  hoox trace keys                            List filter keys
  hoox trace values '$metadata.service'          List worker names
  hoox trace destinations                        List OTLP destinations
  hoox trace destinations add honeycomb https://api.honeycomb.io/1/traces
  hoox trace usage                               Show event counts`
    );

  // -- trace events ---------------------------------------------------------
  traceCmd
    .command("events")
    .summary("Query trace events (spans) with filters")
    .description(
      `Query trace events (spans) from Workers automatic tracing.

Filters:
  --service <name>    Filter by worker service name
  --trigger <path>    Filter by trigger path/endpoint
  --level <level>     Filter by log level (error, warn, info, debug)
  --limit <n>         Maximum events to return (default: 50)
  --from <time>       Start time (ISO-8601 or relative: 1h, 30m, 2d)
  --to <time>         End time (ISO-8601 or relative)

EXAMPLES:
  hoox trace events                              Recent events
  hoox trace events --service trade-worker       Specific worker
  hoox trace events --level error --from 2h      Errors in last 2 hours
  hoox trace events --trigger /webhook           Webhook events`
    )
    .option("--service <name>", "Filter by worker service name")
    .option("--trigger <path>", "Filter by trigger path/endpoint")
    .option("--level <level>", "Filter by log level (error, warn, info, debug)")
    .option("--limit <n>", "Maximum events to return", "50")
    .option("--from <time>", "Start time (ISO-8601 or relative: 1h, 30m, 2d)")
    .option("--to <time>", "End time (ISO-8601 or relative)")
    .action(
      withErrorHandling(
        async (
          options: {
            service?: string;
            trigger?: string;
            level?: string;
            limit?: string;
            from?: string;
            to?: string;
          },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          await handleEvents(
            {
              service: options.service,
              trigger: options.trigger,
              level: options.level,
              limit: options.limit ? parseInt(options.limit, 10) : undefined,
              from: options.from,
              to: options.to,
            },
            fmt
          );
        },
        { service: "trace" }
      )
    );

  // -- trace metrics --------------------------------------------------------
  traceCmd
    .command("metrics")
    .summary("Calculate trace metrics (p99, avg, counts)")
    .description(
      `Calculate trace metrics from Workers automatic tracing.

Options:
  --service <name>    Filter by worker service name
  --operator <op>     Aggregation operator (count, avg, p99, p95, p90, min, max, sum)
  --key <field>       Field to calculate over (e.g. duration.ms)
  --groupBy <field>   Group results by field (e.g. $metadata.service)
  --from <time>       Start time (ISO-8601 or relative: 1h, 30m, 2d)
  --to <time>         End time (ISO-8601 or relative)

EXAMPLES:
  hoox trace metrics                             Count all events
  hoox trace metrics --operator p99 --key duration.ms   P99 latency
  hoox trace metrics --operator avg --key duration.ms   Average latency
  hoox trace metrics --groupBy $metadata.service        Group by worker`
    )
    .option("--service <name>", "Filter by worker service name")
    .option(
      "--operator <op>",
      "Aggregation operator (count, avg, p99, p95, p90, min, max, sum)"
    )
    .option("--key <field>", "Field to calculate over (e.g. duration.ms)")
    .option("--groupBy <field>", "Group results by field")
    .option("--from <time>", "Start time (ISO-8601 or relative: 1h, 30m, 2d)")
    .option("--to <time>", "End time (ISO-8601 or relative)")
    .action(
      withErrorHandling(
        async (
          options: {
            service?: string;
            operator?: string;
            key?: string;
            groupBy?: string;
            from?: string;
            to?: string;
          },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          await handleMetrics(
            {
              service: options.service,
              operator: options.operator,
              key: options.key,
              groupBy: options.groupBy,
              from: options.from,
              to: options.to,
            },
            fmt
          );
        },
        { service: "trace" }
      )
    );

  // -- trace live -----------------------------------------------------------
  traceCmd
    .command("live")
    .summary("Live tail traces in real-time")
    .description(
      `Live tail traces in real-time from Workers automatic tracing.

Options:
  --service <name>    Filter by worker service name
  --duration <secs>   Duration to tail in seconds (default: 60)

EXAMPLES:
  hoox trace live                                Tail all workers
  hoox trace live --service trade-worker         Tail specific worker
  hoox trace live --duration 120                 Tail for 2 minutes`
    )
    .option("--service <name>", "Filter by worker service name")
    .option("--duration <secs>", "Duration to tail in seconds", "60")
    .action(
      withErrorHandling(
        async (
          options: { service?: string; duration?: string },
          _cmd: Command
        ) => {
          await handleLive({
            service: options.service,
            duration: options.duration
              ? parseInt(options.duration, 10)
              : undefined,
          });
        },
        { service: "trace" }
      )
    );

  // -- trace keys -----------------------------------------------------------
  traceCmd
    .command("keys")
    .summary("List available filter keys")
    .description(
      `List available filter keys for trace queries.

Use these keys with --service, --trigger, --groupBy, etc.

Options:
  --needle <text>     Search for keys containing text
  --limit <n>         Maximum keys to return (default: 100)

EXAMPLES:
  hoox trace keys                                List all keys
  hoox trace keys --needle service               Find service-related keys`
    )
    .option("--needle <text>", "Search for keys containing text")
    .option("--limit <n>", "Maximum keys to return", "100")
    .action(
      withErrorHandling(
        async (options: { needle?: string; limit?: string }, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await handleKeys(
            {
              needle: options.needle,
              limit: options.limit ? parseInt(options.limit, 10) : undefined,
            },
            fmt
          );
        },
        { service: "trace" }
      )
    );

  // -- trace values ---------------------------------------------------------
  traceCmd
    .command("values <key>")
    .summary("List values for a filter key")
    .description(
      `List available values for a specific filter key.

Use this to discover valid values for filters like $metadata.service.

Arguments:
  key                 The filter key (e.g. $metadata.service)

Options:
  --type <type>       Value type (string, number, boolean)
  --limit <n>         Maximum values to return (default: 50)
  --from <time>       Start time (ISO-8601 or relative: 1h, 30m, 2d)
  --to <time>         End time (ISO-8601 or relative)

EXAMPLES:
  hoox trace values '$metadata.service'          List worker names
  hoox trace values '$metadata.level'            List log levels
  hoox trace values '$metadata.trigger' --from 1h  Triggers in last hour`
    )
    .option("--type <type>", "Value type (string, number, boolean)", "string")
    .option("--limit <n>", "Maximum values to return", "50")
    .option("--from <time>", "Start time (ISO-8601 or relative: 1h, 30m, 2d)")
    .option("--to <time>", "End time (ISO-8601 or relative)")
    .action(
      withErrorHandling(
        async (
          key: string,
          options: {
            type?: string;
            limit?: string;
            from?: string;
            to?: string;
          },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          await handleValues(
            key,
            {
              type: options.type,
              limit: options.limit ? parseInt(options.limit, 10) : undefined,
              from: options.from,
              to: options.to,
            },
            fmt
          );
        },
        { service: "trace" }
      )
    );

  // -- trace destinations ---------------------------------------------------
  // Parent action defaults to `list` when no subcommand is given
  // (previously printed help and exited 1).
  const destinationsCmd = traceCmd
    .command("destinations")
    .summary("Manage OTLP export destinations")
    .description(
      `List and manage OTLP export destinations.

SUBCOMMANDS:
  list              List destinations (default when no subcommand given)
  add <name> <url>  Add a destination
  remove <slug>     Remove a destination

EXAMPLES:
  hoox trace destinations                      List (default)
  hoox trace destinations list
  hoox trace destinations add honeycomb https://api.honeycomb.io/1/traces`
    )
    .action(
      withErrorHandling(
        async (_options: unknown, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await handleDestinationsList(fmt);
        },
        { service: "trace" }
      )
    );

  destinationsCmd
    .command("list")
    .summary("List OTLP export destinations")
    .description(
      `List all configured OTLP export destinations.

Destinations allow exporting traces (and logs) to third-party observability
platforms like Honeycomb, Grafana Cloud, Sentry, Axiom, etc.

EXAMPLES:
  hoox trace destinations list                 List all destinations
  hoox trace destinations list --json          JSON output`
    )
    .action(
      withErrorHandling(
        async (_options: unknown, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await handleDestinationsList(fmt);
        },
        { service: "trace" }
      )
    );

  destinationsCmd
    .command("add <name> <url>")
    .summary("Add an OTLP export destination")
    .description(
      `Add a new OTLP export destination.

Arguments:
  name                Human-readable name for the destination
  url                 OTLP endpoint URL

Options:
  --headers <json>    Optional headers as JSON (e.g. '{"Authorization":"Bearer token"}')

EXAMPLES:
  hoox trace destinations add honeycomb https://api.honeycomb.io/1/traces
  hoox trace destinations add grafana https://otlp.grafana.cloud/v1/traces
  hoox trace destinations add sentry https://otel.sentry.io/v1/traces --headers '{"Authorization":"Bearer dsn..."}'`
    )
    .option("--headers <json>", "Optional headers as JSON")
    .action(
      withErrorHandling(
        async (
          name: string,
          url: string,
          options: { headers?: string },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          await handleDestinationsAdd(name, url, options, fmt);
        },
        { service: "trace" }
      )
    );

  destinationsCmd
    .command("remove <slug>")
    .summary("Remove an OTLP destination")
    .description(
      `Remove an OTLP export destination by slug.

Arguments:
  slug                The destination slug identifier

EXAMPLES:
  hoox trace destinations remove honeycomb`
    )
    .action(
      withErrorHandling(
        async (slug: string, _options: unknown, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await handleDestinationsRemove(slug, fmt);
        },
        { service: "trace" }
      )
    );

  // -- trace usage ----------------------------------------------------------
  traceCmd
    .command("usage")
    .summary("Show trace event count/usage")
    .description(
      `Show observability usage statistics (event counts).

Displays total event count and breakdown by worker.

EXAMPLES:
  hoox trace usage                             Show usage
  hoox trace usage --json                      JSON output`
    )
    .action(
      withErrorHandling(
        async (_options: unknown, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await handleUsage(fmt);
        },
        { service: "trace" }
      )
    );
}
