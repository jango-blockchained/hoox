/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox infra` command group — Cloudflare infrastructure management.
 *
 * Subcommands:
 *   provision          — Auto-provision D1/KV/R2/Queues from wrangler.jsonc
 *   d1 [list|create|delete]   — D1 database management
 *   kv [list|create|delete]   — KV namespace management
 *   r2 [list|create|delete]   — R2 bucket management
 *   queues [list|create|delete] — Queue management
 *
 * All operations delegate to CloudflareService. Output respects --json / --quiet.
 */

import { Command } from "commander";
import { spinner } from "@clack/prompts";
import { parse } from "jsonc-parser";
import { resolve } from "node:path";
import { CloudflareService } from "../../services/cloudflare/index.js";
import { ConfigService } from "../../services/config/index.js";
import {
  formatTable,
  formatSuccess,
  formatError,
  formatJson,
} from "../../utils/formatters.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { theme } from "../../utils/theme.js";
import type { InfraOptions, ProvisionItem, ProvisionResult } from "./types.js";
import type { WranglerResult } from "../../services/cloudflare/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract global options (--json, --quiet) from a commander Command. */
function getOptions(cmd: Command): InfraOptions {
  const opts = cmd.optsWithGlobals();
  return { json: opts.json, quiet: opts.quiet };
}

/**
 * Try to parse a wrangler JSON list output and display as a table.
 * Falls back to raw text output if parsing fails.
 */
function displayListResult(
  result: WranglerResult<string>,
  opts: InfraOptions,
  columns?: string[]
): void {
  if (!result.ok) {
    formatError(new CLIError(result.error, ExitCode.ERROR), opts);
    return;
  }

  const data = result.value;

  // Try JSON parse for structured output
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      if (opts.json) {
        formatJson(parsed, opts);
        return;
      }
      const rows = parsed.map((item: Record<string, unknown>) => {
        if (columns) {
          const row: Record<string, string> = {};
          for (const col of columns) {
            row[col] = String(item[col] ?? "");
          }
          return row;
        }
        // Show all top-level keys
        const row: Record<string, string> = {};
        for (const [k, v] of Object.entries(item)) {
          if (typeof v !== "object" || v === null) {
            row[k] = String(v);
          }
        }
        return row;
      });
      formatTable(rows, opts);
      return;
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      if (opts.json) {
        formatJson(parsed, opts);
        return;
      }
    }
  } catch {
    // Not JSON — fall through to raw output
  }

  // Raw text output
  if (opts.json) {
    formatJson({ output: data }, opts);
  } else {
    process.stdout.write(data + "\n");
  }
}

/** Handle a create operation: run the service call, show success/error. */
async function handleCreate(
  name: string,
  label: string,
  fn: (name: string) => Promise<WranglerResult<string>>,
  opts: InfraOptions
): Promise<void> {
  if (!opts.quiet) {
    process.stdout.write(`${theme.label(`Creating ${label}:`)} ${name}\n`);
  }

  const result = await fn(name);
  if (result.ok) {
    formatSuccess(`${label} "${name}" created`, opts);
  } else {
    formatError(new CLIError(result.error, ExitCode.ERROR), opts);
  }
}

/** Handle a delete operation: run the service call, show success/error. */
async function handleDelete(
  name: string,
  label: string,
  fn: (name: string) => Promise<WranglerResult<string>>,
  opts: InfraOptions
): Promise<void> {
  if (!opts.quiet) {
    process.stdout.write(`${theme.label(`Deleting ${label}:`)} ${name}\n`);
  }

  const result = await fn(name);
  if (result.ok) {
    formatSuccess(`${label} "${name}" deleted`, opts);
  } else {
    formatError(new CLIError(result.error, ExitCode.ERROR), opts);
  }
}

// ---------------------------------------------------------------------------
// D1 handlers
// ---------------------------------------------------------------------------

async function doD1List(
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  const result = await cloudflare.d1List();
  displayListResult(result, opts, ["name", "uuid", "version", "num_tables"]);
}

async function doD1Create(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleCreate(name, "D1 database", (n) => cloudflare.d1Create(n), opts);
}

async function doD1Delete(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleDelete(name, "D1 database", (n) => cloudflare.d1Delete(n), opts);
}

// ---------------------------------------------------------------------------
// KV handlers
// ---------------------------------------------------------------------------

async function doKvList(
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  const result = await cloudflare.kvList();
  displayListResult(result, opts);
}

async function doKvCreate(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleCreate(name, "KV namespace", (n) => cloudflare.kvCreate(n), opts);
}

async function doKvDelete(
  id: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleDelete(id, "KV namespace", (n) => cloudflare.kvDelete(n), opts);
}

// ---------------------------------------------------------------------------
// R2 handlers
// ---------------------------------------------------------------------------

async function doR2List(
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  const result = await cloudflare.r2List();
  displayListResult(result, opts);
}

async function doR2Create(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleCreate(name, "R2 bucket", (n) => cloudflare.r2Create(n), opts);
}

async function doR2Delete(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleDelete(name, "R2 bucket", (n) => cloudflare.r2Delete(n), opts);
}

// ---------------------------------------------------------------------------
// Queues handlers
// ---------------------------------------------------------------------------

async function doQueueList(
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  const result = await cloudflare.queueList();
  displayListResult(result, opts);
}

async function doQueueCreate(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleCreate(name, "Queue", (n) => cloudflare.queueCreate(n), opts);
}

async function doQueueDelete(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleDelete(name, "Queue", (n) => cloudflare.queueDelete(n), opts);
}

// ---------------------------------------------------------------------------
// Provision dry-run handler
// ---------------------------------------------------------------------------

/**
 * Dry-run version of `doProvision` — scans all enabled workers' wrangler.jsonc
 * files and prints what resources *would* be created, without making any API calls.
 * Reuses the same scanning pattern as the full provision flow.
 */
async function doProvisionDryRun(opts: InfraOptions): Promise<void> {
  const configService = new ConfigService();

  try {
    await configService.load();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    formatError(new CLIError(message, ExitCode.ERROR), opts);
    return;
  }

  const enabledWorkers = configService.listEnabledWorkers();

  if (enabledWorkers.length === 0) {
    if (!opts.quiet) {
      process.stdout.write(
        theme.dim("No enabled workers found in wrangler.jsonc.\n")
      );
    }
    return;
  }

  const plan: Array<{ worker: string; resources: string[] }> = [];

  for (const workerName of enabledWorkers) {
    const workerConfig = configService.getWorker(workerName);
    if (!workerConfig?.path) continue;

    const wranglerPath = resolve(workerConfig.path, "wrangler.jsonc");
    const file = Bun.file(wranglerPath);

    if (!(await file.exists())) continue;

    let wranglerConfig: Record<string, unknown>;
    try {
      const content = await file.text();
      wranglerConfig = (parse(content) ?? {}) as Record<string, unknown>;
    } catch {
      continue;
    }

    const resources: string[] = [];

    // D1 databases
    const d1Databases = Array.isArray(wranglerConfig.d1_databases)
      ? (wranglerConfig.d1_databases as Array<Record<string, unknown>>)
      : [];
    for (const db of d1Databases) {
      const dbName = (db.database_name as string) ?? (db.binding as string);
      if (dbName) resources.push(`D1: ${dbName}`);
    }

    // KV namespaces
    const kvNamespaces = Array.isArray(wranglerConfig.kv_namespaces)
      ? (wranglerConfig.kv_namespaces as Array<Record<string, unknown>>)
      : [];
    for (const kv of kvNamespaces) {
      const kvBinding = (kv.binding as string) ?? `kv-${workerName}`;
      resources.push(`KV: ${kvBinding}`);
    }

    // R2 buckets
    const r2Buckets = Array.isArray(wranglerConfig.r2_buckets)
      ? (wranglerConfig.r2_buckets as Array<Record<string, unknown>>)
      : [];
    for (const bucket of r2Buckets) {
      const bucketName =
        (bucket.bucket_name as string) ?? (bucket.binding as string);
      if (bucketName) resources.push(`R2: ${bucketName}`);
    }

    // Queues
    let queueNames: string[] = [];
    if (wranglerConfig.queues && typeof wranglerConfig.queues === "object") {
      const queues = wranglerConfig.queues as Record<string, unknown>;
      const producers = Array.isArray(queues.producers)
        ? (queues.producers as Array<Record<string, unknown>>)
        : [];
      const consumers = Array.isArray(queues.consumers)
        ? (queues.consumers as Array<Record<string, unknown>>)
        : [];
      queueNames = [
        ...producers.map((q) => q.queue as string),
        ...consumers.map((q) => q.queue as string),
      ].filter(Boolean);
    }
    for (const qName of [...new Set(queueNames)]) {
      resources.push(`Queue: ${qName}`);
    }

    if (resources.length > 0) {
      plan.push({ worker: workerName, resources });
    }
  }

  if (plan.length === 0) {
    process.stdout.write(
      theme.dim("No provisionable resources found in any worker config.\n")
    );
    return;
  }

  process.stdout.write(theme.heading("Resources to provision:\n\n"));
  for (const entry of plan) {
    process.stdout.write(`${theme.bold(entry.worker)}\n`);
    for (const r of entry.resources) {
      process.stdout.write(`${theme.dim("  ─")} ${r}\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write(
    `${theme.dim("Run without --dry-run to provision these resources.\n")}`
  );
}

// ---------------------------------------------------------------------------
// Provision handler
// ---------------------------------------------------------------------------

/**
 * Provision all infrastructure by scanning each enabled worker's wrangler.jsonc
 * for D1 databases, KV namespaces, R2 buckets, and Queue bindings, then
 * auto-creating any referenced resources via CloudflareService.
 */
async function doProvision(
  opts: InfraOptions,
  cf?: CloudflareService,
  config?: ConfigService
): Promise<ProvisionResult> {
  const cloudflare = cf ?? new CloudflareService();
  const configService = config ?? new ConfigService();
  const items: ProvisionItem[] = [];
  let created = 0;
  let errors = 0;
  let exists = 0;

  try {
    await configService.load();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    formatError(new CLIError(message, ExitCode.ERROR), opts);
    return {
      items: [],
      summary: { total: 0, created: 0, errors: 0, exists: 0 },
    };
  }

  const enabledWorkers = configService.listEnabledWorkers();

  if (enabledWorkers.length === 0) {
    if (!opts.quiet) {
      process.stdout.write(
        theme.dim("No enabled workers found in wrangler.jsonc.\n")
      );
    }
    return {
      items: [],
      summary: { total: 0, created: 0, errors: 0, exists: 0 },
    };
  }

  const s = spinner();

  for (const workerName of enabledWorkers) {
    const workerConfig = configService.getWorker(workerName);
    if (!workerConfig?.path) continue;

    const wranglerPath = resolve(workerConfig.path, "wrangler.jsonc");
    const file = Bun.file(wranglerPath);

    if (!(await file.exists())) continue;

    let wranglerConfig: Record<string, unknown>;
    try {
      const content = await file.text();
      wranglerConfig = (parse(content) ?? {}) as Record<string, unknown>;
    } catch {
      // Skip workers with invalid wrangler.jsonc
      continue;
    }

    // -- D1 databases --
    const d1Databases = Array.isArray(wranglerConfig.d1_databases)
      ? (wranglerConfig.d1_databases as Array<Record<string, unknown>>)
      : [];
    for (const db of d1Databases) {
      const dbName = (db.database_name as string) ?? (db.binding as string);
      if (!dbName) continue;

      s.start(`Provisioning D1 database: ${dbName}`);
      const result = await cloudflare.d1Create(dbName);
      if (result.ok) {
        items.push({ name: dbName, type: "d1", status: "created" });
        created++;
        s.stop(`D1 database "${dbName}" created`);
      } else if (result.error.toLowerCase().includes("already exists")) {
        items.push({ name: dbName, type: "d1", status: "exists" });
        exists++;
        s.stop(`D1 database "${dbName}" already exists`);
      } else {
        items.push({
          name: dbName,
          type: "d1",
          status: "error",
          error: result.error,
        });
        errors++;
        s.stop(`D1 database "${dbName}" failed: ${result.error}`);
      }
    }

    // -- KV namespaces --
    const kvNamespaces = Array.isArray(wranglerConfig.kv_namespaces)
      ? (wranglerConfig.kv_namespaces as Array<Record<string, unknown>>)
      : [];
    for (const kv of kvNamespaces) {
      const kvBinding = (kv.binding as string) ?? `kv-${workerName}`;
      s.start(`Provisioning KV namespace: ${kvBinding}`);
      const result = await cloudflare.kvCreate(kvBinding);
      if (result.ok) {
        items.push({ name: kvBinding, type: "kv", status: "created" });
        created++;
        s.stop(`KV namespace "${kvBinding}" created`);
      } else if (result.error.toLowerCase().includes("already exists")) {
        items.push({ name: kvBinding, type: "kv", status: "exists" });
        exists++;
        s.stop(`KV namespace "${kvBinding}" already exists`);
      } else {
        items.push({
          name: kvBinding,
          type: "kv",
          status: "error",
          error: result.error,
        });
        errors++;
        s.stop(`KV namespace "${kvBinding}" failed: ${result.error}`);
      }
    }

    // -- R2 buckets --
    const r2Buckets = Array.isArray(wranglerConfig.r2_buckets)
      ? (wranglerConfig.r2_buckets as Array<Record<string, unknown>>)
      : [];
    for (const bucket of r2Buckets) {
      const bucketName =
        (bucket.bucket_name as string) ?? (bucket.binding as string);
      if (!bucketName) continue;

      s.start(`Provisioning R2 bucket: ${bucketName}`);
      const result = await cloudflare.r2Create(bucketName);
      if (result.ok) {
        items.push({ name: bucketName, type: "r2", status: "created" });
        created++;
        s.stop(`R2 bucket "${bucketName}" created`);
      } else if (result.error.toLowerCase().includes("already exists")) {
        items.push({ name: bucketName, type: "r2", status: "exists" });
        exists++;
        s.stop(`R2 bucket "${bucketName}" already exists`);
      } else {
        items.push({
          name: bucketName,
          type: "r2",
          status: "error",
          error: result.error,
        });
        errors++;
        s.stop(`R2 bucket "${bucketName}" failed: ${result.error}`);
      }
    }

    // -- Queues --
    let queueNames: string[] = [];
    if (wranglerConfig.queues && typeof wranglerConfig.queues === "object") {
      const queues = wranglerConfig.queues as Record<string, unknown>;
      const producers = Array.isArray(queues.producers)
        ? (queues.producers as Array<Record<string, unknown>>)
        : [];
      const consumers = Array.isArray(queues.consumers)
        ? (queues.consumers as Array<Record<string, unknown>>)
        : [];
      queueNames = [
        ...producers.map((q) => q.queue as string),
        ...consumers.map((q) => q.queue as string),
      ].filter(Boolean);
    }
    for (const qName of [...new Set(queueNames)]) {
      s.start(`Provisioning Queue: ${qName}`);
      const result = await cloudflare.queueCreate(qName);
      if (result.ok) {
        items.push({ name: qName, type: "queue", status: "created" });
        created++;
        s.stop(`Queue "${qName}" created`);
      } else if (result.error.toLowerCase().includes("already exists")) {
        items.push({ name: qName, type: "queue", status: "exists" });
        exists++;
        s.stop(`Queue "${qName}" already exists`);
      } else {
        items.push({
          name: qName,
          type: "queue",
          status: "error",
          error: result.error,
        });
        errors++;
        s.stop(`Queue "${qName}" failed: ${result.error}`);
      }
    }
  }

  const summary = { total: items.length, created, errors, exists };
  const result: ProvisionResult = { items, summary };

  // Show summary table
  if (!opts.quiet) {
    const summaryRows = [
      { Metric: "Total resources", Value: String(summary.total) },
      { Metric: "Created", Value: String(summary.created) },
      { Metric: "Already existed", Value: String(summary.exists) },
      { Metric: "Errors", Value: String(summary.errors) },
    ];
    if (opts.json) {
      formatJson(result, opts);
    } else {
      process.stdout.write("\n");
      formatTable(summaryRows, opts);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Vectorize handlers
// ---------------------------------------------------------------------------

async function doVectorizeList(
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  const result = await cloudflare.vectorizeList();
  displayListResult(result, opts, ["name", "id", "dimensions", "metric"]);
}

async function doVectorizeCreate(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleCreate(
    name,
    "Vectorize index",
    (n) => cloudflare.vectorizeCreate(n),
    opts
  );
}

async function doVectorizeDelete(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  await handleDelete(
    name,
    "Vectorize index",
    (n) => cloudflare.vectorizeDelete(n),
    opts
  );
}

// ---------------------------------------------------------------------------
// Analytics handlers
// ---------------------------------------------------------------------------

async function doAnalyticsList(
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  const result = await cloudflare.analyticsList();
  displayListResult(result, opts);
}

async function doAnalyticsCreate(
  name: string,
  opts: InfraOptions,
  cf?: CloudflareService
): Promise<void> {
  const cloudflare = cf ?? new CloudflareService();
  const result = await cloudflare.analyticsCreate(name);
  if (result.ok) {
    formatSuccess(`Analytics dataset "${name}" created`, opts);
  } else {
    process.stdout.write(`${result.error}\n`);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the `hoox infra` command group on the given commander program.
 *
 * @example
 * ```ts
 * import { Command } from "commander";
 * import { registerInfraCommand } from "./commands/infra/index.js";
 * const program = new Command();
 * registerInfraCommand(program);
 * program.parse();
 * ```
 */
export function registerInfraCommand(program: Command): void {
  const infraCmd = program
    .command("infra")
    .summary(
      "Manage Cloudflare infrastructure (D1, KV, R2, Queues, Vectorize, Analytics)"
    )
    .description(
      `Provision and manage Cloudflare infrastructure resources.

INFRASTRUCTURE TYPES:
  D1        - SQL databases for persistent storage
  KV        - Key-value stores for configuration and caching
  R2        - S3-compatible object storage
  Queues    - Message queues for async processing
  Vectorize - Vector database for AI-powered search
  Analytics - Time-series analytics engine

EXAMPLES:
  hoox infra provision                          Auto-provision from wrangler.jsonc
  hoox infra d1 list                            List D1 databases
  hoox infra d1 create my-db                    Create a D1 database
  hoox infra kv list                            List KV namespaces
  hoox infra r2 list                            List R2 buckets
  hoox infra queues list                        List queues
  hoox infra vectorize list                     List Vectorize indexes
  hoox infra vectorize create my-rag-index      Create a Vectorize index
  hoox infra analytics list                     List Analytics datasets`
    );

  // -- provision ---------------------------------------------------------

  infraCmd
    .command("provision")
    .summary("Auto-provision infrastructure from wrangler.jsonc")
    .description(
      `Automatically provision all required infrastructure based on worker wrangler.jsonc files.

This reads each worker's wrangler.jsonc and creates:
  - D1 databases (from d1 binding)
  - KV namespaces (from kv_namespaces)
  - R2 buckets (from r2_buckets)
  - Queues (from queues)

OPTIONS:
  --dry-run     Preview what resources would be created without creating them

EXAMPLES:
  hoox infra provision
  hoox infra provision --dry-run`
    )
    .option(
      "--dry-run",
      "Preview what resources would be created without creating them"
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getOptions(cmd);
          const globalOpts = cmd.optsWithGlobals();
          if (globalOpts.dryRun) {
            await doProvisionDryRun(opts);
          } else {
            await doProvision(opts);
          }
        },
        { service: "infra" }
      )
    );

  // -- d1 -----------------------------------------------------------------

  const d1Cmd = infraCmd
    .command("d1")
    .summary("Manage D1 SQL databases")
    .description(
      `D1 is Cloudflare's serverless SQL database.

EXAMPLES:
  hoox infra d1 list
  hoox infra d1 create my-database
  hoox infra d1 delete my-database`
    );

  d1Cmd
    .command("list")
    .summary("List all D1 databases")
    .description(
      `List all D1 databases in your Cloudflare account.

EXAMPLES:
  hoox infra d1 list`
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getOptions(cmd);
          await doD1List(opts);
        },
        { service: "infra" }
      )
    );

  d1Cmd
    .command("create <name>")
    .summary("Create a new D1 database")
    .description(
      `Create a new D1 database.

ARGUMENTS:
  name    Database name

EXAMPLES:
  hoox infra d1 create trade-data-db`
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doD1Create(name, opts);
        },
        { service: "infra" }
      )
    );

  d1Cmd
    .command("delete <name>")
    .summary("Delete a D1 database")
    .description(
      `Delete a D1 database (WARNING: destructive operation).

ARGUMENTS:
  name    Database name

EXAMPLES:
  hoox infra d1 delete trade-data-db`
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doD1Delete(name, opts);
        },
        { service: "infra" }
      )
    );

  // -- kv -----------------------------------------------------------------

  const kvCmd = infraCmd
    .command("kv")
    .summary("Manage KV namespaces")
    .description(
      `KV (Key-Value) namespaces for configuration and caching.

EXAMPLES:
  hoox infra kv list
  hoox infra kv create CONFIG_KV
  hoox infra kv delete <id>`
    );

  kvCmd
    .command("list")
    .summary("List all KV namespaces")
    .description(
      `List all KV namespaces in your Cloudflare account.

EXAMPLES:
  hoox infra kv list`
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getOptions(cmd);
          await doKvList(opts);
        },
        { service: "infra" }
      )
    );

  kvCmd
    .command("create <name>")
    .summary("Create a new KV namespace")
    .description(
      `Create a new KV namespace.

ARGUMENTS:
  name    KV namespace title

EXAMPLES:
  hoox infra kv create CONFIG_KV`
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doKvCreate(name, opts);
        },
        { service: "infra" }
      )
    );

  kvCmd
    .command("delete <id>")
    .summary("Delete a KV namespace by ID")
    .description(
      `Delete a KV namespace by its ID (WARNING: destructive operation).

ARGUMENTS:
  id    KV namespace ID (get from 'kv list')

EXAMPLES:
  hoox infra kv delete c5917667a21745e390ff969f32b1847d`
    )
    .action(
      withErrorHandling(
        async (id: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doKvDelete(id, opts);
        },
        { service: "infra" }
      )
    );

  // -- r2 -----------------------------------------------------------------

  const r2Cmd = infraCmd
    .command("r2")
    .summary("Manage R2 object storage buckets")
    .description(
      `R2 is Cloudflare's S3-compatible object storage.

EXAMPLES:
  hoox infra r2 list
  hoox infra r2 create trade-reports
  hoox infra r2 delete trade-reports`
    );

  r2Cmd
    .command("list")
    .summary("List all R2 buckets")
    .description(
      `List all R2 buckets in your Cloudflare account.

EXAMPLES:
  hoox infra r2 list`
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getOptions(cmd);
          await doR2List(opts);
        },
        { service: "infra" }
      )
    );

  r2Cmd
    .command("create <name>")
    .summary("Create a new R2 bucket")
    .description(
      `Create a new R2 bucket.

ARGUMENTS:
  name    Bucket name

EXAMPLES:
  hoox infra r2 create trade-reports`
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doR2Create(name, opts);
        },
        { service: "infra" }
      )
    );

  r2Cmd
    .command("delete <name>")
    .summary("Delete an R2 bucket")
    .description(
      `Delete an R2 bucket (WARNING: destructive operation).

ARGUMENTS:
  name    Bucket name

EXAMPLES:
  hoox infra r2 delete trade-reports`
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doR2Delete(name, opts);
        },
        { service: "infra" }
      )
    );

  // -- queues -------------------------------------------------------------

  const queuesCmd = infraCmd
    .command("queues")
    .summary("Manage Cloudflare Queues")
    .description(
      `Queues for asynchronous message processing between workers.

EXAMPLES:
  hoox infra queues list
  hoox infra queues create trade-execution
  hoox infra queues delete trade-execution`
    );

  queuesCmd
    .command("list")
    .summary("List all Queues")
    .description(
      `List all queues in your Cloudflare account.

EXAMPLES:
  hoox infra queues list`
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getOptions(cmd);
          await doQueueList(opts);
        },
        { service: "infra" }
      )
    );

  queuesCmd
    .command("create <name>")
    .summary("Create a new Queue")
    .description(
      `Create a new queue.

ARGUMENTS:
  name    Queue name

EXAMPLES:
  hoox infra queues create trade-execution`
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doQueueCreate(name, opts);
        },
        { service: "infra" }
      )
    );

  queuesCmd
    .command("delete <name>")
    .summary("Delete a Queue")
    .description(
      `Delete a queue (WARNING: destructive operation).

ARGUMENTS:
  name    Queue name

EXAMPLES:
  hoox infra queues delete trade-execution`
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doQueueDelete(name, opts);
        },
        { service: "infra" }
      )
    );

  // -- vectorize ---------------------------------------------------------

  const vectorizeCmd = infraCmd
    .command("vectorize")
    .summary("Manage Vectorize indexes")
    .description(
      `Vectorize is Cloudflare's vector database for AI-powered search.

EXAMPLES:
  hoox infra vectorize list
  hoox infra vectorize create my-rag-index
  hoox infra vectorize delete my-rag-index`
    );

  vectorizeCmd
    .command("list")
    .summary("List all Vectorize indexes")
    .description("List all Vectorize indexes in your Cloudflare account.")
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getOptions(cmd);
          await doVectorizeList(opts);
        },
        { service: "infra" }
      )
    );

  vectorizeCmd
    .command("create <name>")
    .summary("Create a new Vectorize index")
    .description(
      "Create a new Vectorize index with default dimensions (768) and cosine metric."
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doVectorizeCreate(name, opts);
        },
        { service: "infra" }
      )
    );

  vectorizeCmd
    .command("delete <name>")
    .summary("Delete a Vectorize index")
    .description("Delete a Vectorize index (WARNING: destructive operation).")
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doVectorizeDelete(name, opts);
        },
        { service: "infra" }
      )
    );

  // -- analytics ---------------------------------------------------------

  const analyticsCmd = infraCmd
    .command("analytics")
    .summary("Manage Analytics Engine datasets")
    .description(
      `Analytics Engine for storing and querying time-series data.

NOTE: Analytics Engine datasets must be created via Cloudflare Dashboard.
The CLI provides creation instructions.

EXAMPLES:
  hoox infra analytics list
  hoox infra analytics create hoox-analytics`
    );

  analyticsCmd
    .command("list")
    .summary("List all Analytics Engine datasets")
    .description("List all Analytics Engine datasets in your account.")
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getOptions(cmd);
          await doAnalyticsList(opts);
        },
        { service: "infra" }
      )
    );

  analyticsCmd
    .command("create <name>")
    .summary("Show instructions for creating an Analytics Engine dataset")
    .description(
      "Analytics Engine datasets must be created via Cloudflare Dashboard."
    )
    .action(
      withErrorHandling(
        async (name: string, _, cmd: Command) => {
          const opts = getOptions(cmd);
          await doAnalyticsCreate(name, opts);
        },
        { service: "infra" }
      )
    );
}

// ---------------------------------------------------------------------------
// Exports (for testing)
// ---------------------------------------------------------------------------

export {
  doD1List,
  doD1Create,
  doD1Delete,
  doKvList,
  doKvCreate,
  doKvDelete,
  doR2List,
  doR2Create,
  doR2Delete,
  doQueueList,
  doQueueCreate,
  doQueueDelete,
  doVectorizeList,
  doVectorizeCreate,
  doVectorizeDelete,
  doAnalyticsList,
  doAnalyticsCreate,
  doProvision,
  doProvisionDryRun,
  displayListResult,
  handleCreate,
  handleDelete,
};
