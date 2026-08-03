/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox check` command group — validation, health checks, and auto-repair.
 *
 * Subcommands:
 *   prerequisites [--tool]   — Validate toolchain and account prerequisites
 *   setup [--json]           — Full system validation (Config, Infrastructure, Secrets, Database)
 *   health [--fix]           — Worker connectivity and responsiveness checks
 *   fix [--dry-run]          — Repair known common issues
 *   submodule-gitignore (sg)  — Validate and fix worker submodule .gitignore files
 */
import { Command } from "commander";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { spinner } from "@clack/prompts";
import { modify, applyEdits, parse } from "jsonc-parser";
import { ConfigService } from "../../services/config/index.js";
import { CloudflareService } from "../../services/cloudflare/index.js";
import { SecretsService } from "../../services/secrets/index.js";
import { registerPrerequisitesCommand } from "./prerequisites-command.js";
import { theme, icons } from "../../utils/theme.js";
import {
  formatSuccess,
  formatError,
  formatTable,
  getFormatOptions,
} from "../../utils/formatters.js";
import { runRichTasks, type RichTaskResult } from "../../utils/rich.js";
import { ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { isGitTracked, gitUntrackFile } from "../../utils/git.js";
import type { FormatOptions } from "../../utils/formatters.js";
import type {
  CheckResult,
  CheckCategory,
  CheckReport,
  HealthCheckResult,
  FixAction,
  FixReport,
} from "./types.js";

// ---------------------------------------------------------------------------
// Submodule Gitignore Constants
// ---------------------------------------------------------------------------

/** Standard .gitignore template for worker submodules */
const WORKER_GITIGNORE_TEMPLATE = `# Environment and secrets (keep example, exclude actual)
.dev.vars
!.dev.vars.example

# Wrangler config (keep example, exclude actual)
wrangler.jsonc
!wrangler.jsonc.example

# Wrangler cache and build artifacts
.wrangler/
dist/
build/

# Dependencies
node_modules/

# IDE and editor files
.idea/
.vscode/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db
`;

/** Critical entries that must be present in a valid worker .gitignore */
const CRITICAL_GITIGNORE_ENTRIES = [
  "wrangler.jsonc",
  ".dev.vars",
  ".wrangler/",
  "node_modules/",
  "!.dev.vars.example",
  "!wrangler.jsonc.example",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a CheckReport from categorised check results.
 */
function buildReport(categories: CheckCategory[]): CheckReport {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const cat of categories) {
    for (const check of cat.checks) {
      total++;
      if (check.success) passed++;
      else failed++;
      warnings += check.warnings.length;
    }
  }

  return {
    success: failed === 0,
    categories,
    summary: { total, passed, failed, warnings },
  };
}

// ---------------------------------------------------------------------------
// Submodule Gitignore Helpers
// ---------------------------------------------------------------------------

/**
 * Get all worker directories from the workers/ folder.
 */
async function getWorkerDirs(): Promise<string[]> {
  const workersDir = path.resolve(process.cwd(), "workers");
  try {
    await Bun.file(workersDir).exists();
  } catch {
    return [];
  }

  try {
    const entries = await readdir(workersDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name !== "node_modules")
      .map((e) => path.join(workersDir, e.name));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Category 1: Config checks
// ---------------------------------------------------------------------------

async function runConfigChecks(
  configService: ConfigService
): Promise<CheckCategory> {
  const checks: CheckResult[] = [];

  // Validate wrangler.jsonc structure
  const validation = configService.validate();
  checks.push({
    name: "wrangler.jsonc validation",
    success: validation.valid,
    errors: validation.errors,
    warnings: [],
  });

  // Check required global fields
  const global = configService.getGlobal();
  const globalErrors: string[] = [];
  if (!global.cloudflare_account_id) {
    globalErrors.push("global.cloudflare_account_id is required");
  }
  checks.push({
    name: "Global config",
    success: globalErrors.length === 0,
    errors: globalErrors,
    warnings: global.cloudflare_api_token
      ? []
      : [
          "global.cloudflare_api_token uses <USE_WRANGLER_SECRET_PUT> placeholder — set via wrangler secret",
        ],
  });

  // Check that each worker has a path
  const workers = configService.listWorkers();
  const pathErrors: string[] = [];
  for (const name of workers) {
    const worker = configService.getWorker(name);
    if (!worker?.path) {
      pathErrors.push(`Worker "${name}" missing path field`);
    }
  }
  checks.push({
    name: "Worker paths",
    success: pathErrors.length === 0,
    errors: pathErrors,
    warnings: [],
  });

  return { name: "Config", checks };
}

// ---------------------------------------------------------------------------
// Category 2: Infrastructure checks
// ---------------------------------------------------------------------------

async function runInfraChecks(cf: CloudflareService): Promise<CheckCategory> {
  const checks: CheckResult[] = [];

  // D1 databases
  const d1Result = await cf.d1List();
  checks.push({
    name: "D1 Databases",
    success: d1Result.ok,
    errors: d1Result.ok
      ? []
      : [d1Result.error ?? "Failed to list D1 databases"],
    warnings: [],
  });

  // KV namespaces
  const kvResult = await cf.kvList();
  checks.push({
    name: "KV Namespaces",
    success: kvResult.ok,
    errors: kvResult.ok
      ? []
      : [kvResult.error ?? "Failed to list KV namespaces"],
    warnings: [],
  });

  // R2 buckets
  const r2Result = await cf.r2List();
  checks.push({
    name: "R2 Buckets",
    success: r2Result.ok,
    errors: r2Result.ok ? [] : [r2Result.error ?? "Failed to list R2 buckets"],
    warnings: [],
  });

  // Queues
  const queueResult = await cf.queueList();
  checks.push({
    name: "Queues",
    success: queueResult.ok,
    errors: queueResult.ok
      ? []
      : [queueResult.error ?? "Failed to list queues"],
    warnings: [],
  });

  return { name: "Infrastructure", checks };
}

// ---------------------------------------------------------------------------
// Category 3: Secrets checks
// ---------------------------------------------------------------------------

async function runSecretsChecks(
  secretsService: SecretsService,
  configService: ConfigService,
  cf: CloudflareService
): Promise<CheckCategory> {
  const checks: CheckResult[] = [];
  const enabledWorkers = configService.listEnabledWorkers();
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const workerName of enabledWorkers) {
    const result = await secretsService.checkLocalSecrets(workerName);
    if (result.missing.length > 0) {
      errors.push(
        `Worker "${workerName}" missing secrets: ${result.missing.join(", ")}`
      );
    }
    for (const secret of result.secrets) {
      if (secret.set && secret.source) {
        warnings.push(
          `Worker "${workerName}": ${secret.name} is set locally (source: ${secret.source})`
        );
      }
    }
  }

  checks.push({
    name: "Worker Secrets (local)",
    success: errors.length === 0,
    errors,
    warnings,
  });

  // Check remote secrets via CloudflareService
  const remoteErrors: string[] = [];
  const remoteWarnings: string[] = [];
  for (const workerName of enabledWorkers) {
    const secrets = secretsService.listSecrets(workerName);
    if (secrets.length === 0) continue;

    const result = await cf.secretList(workerName);
    if (!result.ok) {
      remoteErrors.push(`Worker "${workerName}": ${result.error}`);
    } else {
      remoteWarnings.push(
        `Worker "${workerName}": remote secrets listed OK (${secrets.length} expected)`
      );
    }
  }

  checks.push({
    name: "Worker Secrets (Cloudflare)",
    success: remoteErrors.length === 0,
    errors: remoteErrors,
    warnings: remoteWarnings,
  });

  return { name: "Secrets", checks };
}

// ---------------------------------------------------------------------------
// Category 4: Database checks
// ---------------------------------------------------------------------------

async function runDatabaseChecks(
  cf: CloudflareService,
  configService: ConfigService
): Promise<CheckCategory> {
  const checks: CheckResult[] = [];

  // Look for the D1 worker's database_name
  const d1Worker = configService.getWorker("d1-worker");
  const dbName =
    (d1Worker?.vars as Record<string, string> | undefined)?.database_name ??
    "my-database";

  // Check that database exists via wrangler d1 list
  const d1ListResult = await cf.d1List();
  if (d1ListResult.ok) {
    const hasDb = d1ListResult.value.includes(dbName);
    checks.push({
      name: `D1 Database "${dbName}"`,
      success: hasDb,
      errors: hasDb
        ? []
        : [
            `Database "${dbName}" not found. Create with: wrangler d1 create ${dbName}`,
          ],
      warnings: [],
    });
  } else {
    checks.push({
      name: `D1 Database "${dbName}"`,
      success: false,
      errors: [d1ListResult.error ?? "Could not verify database existence"],
      warnings: [],
    });
  }

  // Verify tables exist (best effort via wrangler d1 execute)
  const requiredTables = [
    "trade_signals",
    "trades",
    "positions",
    "balances",
    "system_logs",
  ];

  // Only run table check if the database exists
  try {
    const hasDb = d1ListResult.ok && d1ListResult.value.includes(dbName);
    if (!hasDb) {
      checks.push({
        name: "Required Tables",
        success: true,
        errors: [],
        warnings: ["Skipped: database does not exist yet"],
      });
    } else {
      const sqlResult = await cf.d1Execute(
        dbName,
        `SELECT name FROM sqlite_master WHERE type='table'`,
        true
      );

      if (sqlResult.ok) {
        // d1Execute now returns the pure JSON (extracted from
        // wrangler's noisy stdout). The shape is a top-level
        // array wrapping an object with a `results` field:
        //   [{ "results": [{ "name": "..." }, ...], "success": true, ... }]
        // We need the inner rows. Earlier wrangler versions
        // returned the rows array directly; the d1Execute wrapper
        // now normalises to the wrapper shape.
        const wrapper: Array<{
          results?: Array<{ name?: string }>;
        }> = JSON.parse(sqlResult.value);
        const rows = wrapper[0]?.results ?? [];
        const tableNames = rows
          .map((r) => r.name)
          .filter((n): n is string => Boolean(n));

        const missing = requiredTables.filter((t) => !tableNames.includes(t));
        if (missing.length === 0) {
          checks.push({
            name: "Required Tables",
            success: true,
            errors: [],
            warnings: [],
          });
        } else {
          checks.push({
            name: "Required Tables",
            success: false,
            errors: [
              `Missing tables: ${missing.join(", ")}. Run migrations first.`,
            ],
            warnings: [],
          });
        }
      } else {
        // Query failed — show warning instead of hard error
        checks.push({
          name: "Required Tables",
          success: true,
          errors: [],
          warnings: [
            `Table schema not verified: ${sqlResult.error}. Run: wrangler d1 execute ${dbName} --command="SELECT name FROM sqlite_master WHERE type='table'" --remote`,
          ],
        });
      }
    }
  } catch {
    checks.push({
      name: "Required Tables",
      success: false,
      errors: ["Could not verify database tables"],
      warnings: [],
    });
  }

  return { name: "Database", checks };
}

/**
 * Render the check report as a human-readable table (non-JSON mode).
 */
function renderReport(report: CheckReport): void {
  for (const category of report.categories) {
    const allPassed = category.checks.every((c) => c.success);
    const icon = allPassed ? icons.success : icons.error;
    process.stdout.write(`\n${icon} ${theme.heading(category.name)}\n`);

    for (const check of category.checks) {
      const marker = check.success
        ? theme.success(`  ${icons.success}`)
        : theme.error(`  ${icons.error}`);
      process.stdout.write(`${marker} ${check.name}\n`);

      for (const err of check.errors) {
        process.stdout.write(`    ${theme.error(icons.error)} ${err}\n`);
      }
      for (const warn of check.warnings) {
        process.stdout.write(`    ${theme.warning(icons.warning)} ${warn}\n`);
      }
    }
  }

  const { summary } = report;
  process.stdout.write(
    `\n${summary.failed > 0 ? theme.error(icons.error) : theme.success(icons.success)} ` +
      `Summary: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.warnings} warnings\n`
  );
}

// ---------------------------------------------------------------------------
// Subcommand: check setup
// ---------------------------------------------------------------------------

async function handleSetup(opts: FormatOptions): Promise<void> {
  try {
    const configService = new ConfigService();
    await configService.load();

    const cf = new CloudflareService();
    const secretsService = await SecretsService.create();

    // Run each check category as a single task in a rich checklist.
    const categories: CheckCategory[] = [];
    const tasks = [
      {
        title: "Validating config",
        run: async (): Promise<CheckCategory> =>
          await runConfigChecks(configService),
      },
      {
        title: "Checking infrastructure (D1, KV, R2, Queues)",
        run: async (): Promise<CheckCategory> => await runInfraChecks(cf),
      },
      {
        title: "Checking secrets",
        run: async (): Promise<CheckCategory> =>
          await runSecretsChecks(secretsService, configService, cf),
      },
      {
        title: "Checking database",
        run: async (): Promise<CheckCategory> =>
          await runDatabaseChecks(cf, configService),
      },
    ];

    const results = await runRichTasks<CheckCategory>(tasks, {
      title: "Running diagnostics",
      format: opts,
      onSummary: (rows: RichTaskResult<CheckCategory>[]) => {
        for (const r of rows) {
          if (r.ok && r.value) categories.push(r.value);
        }
      },
    });

    const report = buildReport(categories);

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      renderReport(report);
    }

    if (!report.success) {
      process.exitCode = ExitCode.ERROR;
    }
    // runRichTasks already sets process.exitCode on task failures;
    // keep this for backward-compat with tests that read it from
    // !report.success.
    if (results.some((r) => !r.ok)) {
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    formatError(message, opts);
    process.exitCode = ExitCode.ERROR;
  }
}

// ---------------------------------------------------------------------------
// Subcommand: check health
// ---------------------------------------------------------------------------

/** Default HTTP probe timeout per worker (ms). */
const HEALTH_PROBE_TIMEOUT_MS = 8_000;

/**
 * Resolve the public base URL for a deployed worker.
 *
 * Prefers `global.subdomain_prefix` (e.g. cryptolinx →
 * `https://{worker}.cryptolinx.workers.dev`). Falls back to account-id
 * style URLs, and allows `HOOX_GATEWAY_URL` to override the `hoox`
 * gateway only.
 */
export function resolveWorkerBaseUrl(
  workerName: string,
  global: { subdomain_prefix?: string; cloudflare_account_id?: string }
): string {
  if (workerName === "hoox") {
    const envUrl = process.env.HOOX_GATEWAY_URL;
    if (envUrl && envUrl.length > 0) {
      return envUrl.replace(/\/+$/, "");
    }
  }

  const prefix = global.subdomain_prefix;
  if (prefix && prefix.length > 0) {
    return `https://${workerName}.${prefix}.workers.dev`;
  }

  const accountId =
    global.cloudflare_account_id || process.env.CLOUDFLARE_ACCOUNT_ID;
  if (accountId && accountId.length > 0) {
    return `https://${workerName}.${accountId}.workers.dev`;
  }

  throw new Error(
    `Cannot resolve URL for worker "${workerName}". Set global.subdomain_prefix or cloudflare_account_id in wrangler.jsonc (or HOOX_GATEWAY_URL for the gateway).`
  );
}

/**
 * HTTP GET `/health` with a hard timeout. Does **not** use `wrangler tail`
 * (which is a long-lived log stream and hangs for tens of seconds per worker).
 */
export async function probeWorkerHealth(
  workerName: string,
  baseUrl: string,
  timeoutMs: number = HEALTH_PROBE_TIMEOUT_MS
): Promise<HealthCheckResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/health`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const responseTime = Date.now() - started;

    if (res.ok) {
      return {
        worker: workerName,
        status: "healthy",
        connectivity: true,
        responseTime,
        url,
      };
    }

    return {
      worker: workerName,
      status: res.status >= 500 ? "down" : "degraded",
      connectivity: true,
      responseTime,
      url,
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    const responseTime = Date.now() - started;
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name: string }).name === "AbortError");
    const message = aborted
      ? `Timeout after ${timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      worker: workerName,
      status: "down",
      connectivity: false,
      responseTime,
      url,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handleHealth(
  opts: FormatOptions,
  autoFix: boolean
): Promise<void> {
  const results: HealthCheckResult[] = [];

  try {
    const configService = new ConfigService();
    await configService.load();
    const global = configService.getGlobal();

    const enabledWorkers = configService.listEnabledWorkers();

    if (enabledWorkers.length === 0) {
      formatSuccess("No enabled workers to check", opts);
      return;
    }

    const tasks = enabledWorkers.map((workerName) => ({
      title: `Probe ${workerName}`,
      run: async (): Promise<HealthCheckResult> => {
        try {
          const baseUrl = resolveWorkerBaseUrl(workerName, global);
          return await probeWorkerHealth(workerName, baseUrl);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            worker: workerName,
            status: "down",
            connectivity: false,
            error: message,
          };
        }
      },
    }));

    const taskResults = await runRichTasks<HealthCheckResult>(tasks, {
      title: `Health-checking ${enabledWorkers.length} worker(s)`,
      format: opts,
    });
    for (const r of taskResults) {
      if (r.value) results.push(r.value);
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    } else {
      const rows = results.map((r) => ({
        Worker: r.worker,
        Status: r.status,
        Latency: r.responseTime != null ? `${r.responseTime}ms` : "-",
        Connectivity: r.connectivity ? "connected" : "failed",
        Error: r.error ?? "-",
      }));
      formatTable(rows, opts);
    }

    if (autoFix && results.some((r) => !r.connectivity)) {
      process.stdout.write(
        `\n${theme.warning(icons.warning)} Auto-fix flag set but health issues require manual investigation.\n`
      );
      process.stdout.write(`${theme.dim("Try: hoox check fix")}\n`);
    }

    const allHealthy = results.every((r) => r.status === "healthy");
    if (!allHealthy) {
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    formatError(message, opts);
    process.exitCode = ExitCode.ERROR;
  }
}

// ---------------------------------------------------------------------------
// Subcommand: check fix
// ---------------------------------------------------------------------------

async function handleFix(opts: FormatOptions, dryRun: boolean): Promise<void> {
  const s = spinner();
  const actions: FixAction[] = [];

  try {
    const configService = new ConfigService();
    s.start("Loading config...");
    await configService.load();
    s.stop("Config loaded");

    const enabledWorkers = configService.listEnabledWorkers();

    // Fix 1: Check for missing .dev.vars files
    for (const workerName of enabledWorkers) {
      const worker = configService.getWorker(workerName);
      if (!worker?.path) continue;

      const devVarsPath = `${worker.path}/.dev.vars`;
      const devVarsFile = Bun.file(devVarsPath);

      if (!(await devVarsFile.exists())) {
        const action: FixAction = {
          description: `Create .dev.vars for worker "${workerName}"`,
          type: "file",
          target: devVarsPath,
          change: `Create ${devVarsPath} with placeholder secrets`,
          applied: false,
        };

        if (!dryRun) {
          try {
            const secrets =
              (worker.secrets ?? [])
                .map((s: string) => `${s}=placeholder_${s.toLowerCase()}`)
                .join("\n") + "\n";
            await Bun.write(devVarsPath, secrets);
            action.applied = true;
          } catch (err) {
            action.error = err instanceof Error ? err.message : String(err);
          }
        }

        actions.push(action);
      }
    }

    // Fix 2: Check for missing NODEJS_COMPAT flag in wrangler.jsonc
    for (const workerName of enabledWorkers) {
      const worker = configService.getWorker(workerName);
      if (!worker?.path) continue;

      const wranglerPath = `${worker.path}/wrangler.jsonc`;
      const wranglerFile = Bun.file(wranglerPath);

      if (await wranglerFile.exists()) {
        const content = await wranglerFile.text();
        // Strip comments for checking
        const strippedContent = content
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "");

        if (!strippedContent.includes("nodejs_compat")) {
          const action: FixAction = {
            description: `Add nodejs_compat to compatibility_flags for worker "${workerName}"`,
            type: "flag",
            target: wranglerPath,
            change:
              'Add "nodejs_compat" to compatibility_flags array in wrangler.jsonc',
            applied: false,
          };

          if (!dryRun) {
            try {
              // Use jsonc-parser to surgically edit JSONC, preserving comments and formatting
              const parsedConfig = parse(content) as Record<string, unknown>;
              let updated = content;

              if (!parsedConfig.compatibility_flags) {
                // Add compatibility_flags array with nodejs_compat
                const edits = modify(
                  content,
                  ["compatibility_flags"],
                  ["nodejs_compat"],
                  {
                    formattingOptions: {
                      tabSize: 2,
                      insertSpaces: true,
                      eol: "\n",
                    },
                  }
                );
                updated = applyEdits(content, edits);
              } else if (Array.isArray(parsedConfig.compatibility_flags)) {
                const flags = parsedConfig.compatibility_flags as string[];
                if (!flags.includes("nodejs_compat")) {
                  // Replace the array with new array containing nodejs_compat
                  const newFlags = [...flags, "nodejs_compat"];
                  const edits = modify(
                    content,
                    ["compatibility_flags"],
                    newFlags,
                    {
                      formattingOptions: {
                        tabSize: 2,
                        insertSpaces: true,
                        eol: "\n",
                      },
                    }
                  );
                  updated = applyEdits(content, edits);
                }
              }

              await Bun.write(wranglerPath, updated);
              action.applied = true;
            } catch (err) {
              action.error = err instanceof Error ? err.message : String(err);
            }
          }

          actions.push(action);
        }
      }
    }

    // Fix 3: Check wrangler.jsonc structure (must have name field)
    for (const workerName of enabledWorkers) {
      const worker = configService.getWorker(workerName);
      if (!worker?.path) continue;

      const wranglerPath = `${worker.path}/wrangler.jsonc`;
      const wranglerFile = Bun.file(wranglerPath);

      if (await wranglerFile.exists()) {
        const content = await wranglerFile.text();

        try {
          // Use jsonc-parser parse() which handles JSONC comments natively
          const parsedConfig = parse(content) as Record<string, unknown>;
          if (!parsedConfig.name) {
            const action: FixAction = {
              description: `Add missing "name" field to wrangler.jsonc for worker "${workerName}"`,
              type: "config",
              target: wranglerPath,
              change: `Set "name" to "${workerName}" in ${wranglerPath}`,
              applied: false,
            };

            if (!dryRun) {
              // Use jsonc-parser modify() to surgically add the name field, preserving formatting
              const edits = modify(content, ["name"], workerName, {
                formattingOptions: {
                  tabSize: 2,
                  insertSpaces: true,
                  eol: "\n",
                },
              });
              const updated = applyEdits(content, edits);
              await Bun.write(wranglerPath, updated);
              action.applied = true;
            }

            actions.push(action);
          }
        } catch {
          actions.push({
            description: `Invalid JSON in wrangler.jsonc for worker "${workerName}"`,
            type: "config",
            target: wranglerPath,
            change: "Fix JSON syntax errors manually",
            applied: false,
            error:
              "Could not parse wrangler.jsonc — fix JSON syntax errors manually",
          });
        }
      }
    }

    s.stop(`Fix scan complete (${dryRun ? "dry-run" : "applied"})`);

    // Calculate summary
    const applied = actions.filter((a) => a.applied).length;
    const failed = actions.filter((a) => a.error).length;
    const skipped = actions.length - applied - failed;

    const report: FixReport = {
      actions,
      dryRun,
      summary: {
        total: actions.length,
        applied,
        skipped,
        failed,
      },
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      for (const action of actions) {
        const icon = action.applied
          ? theme.success(icons.success)
          : action.error
            ? theme.error(icons.error)
            : theme.warning(icons.warning);
        const status = action.applied
          ? "applied"
          : action.error
            ? "failed"
            : dryRun
              ? "would apply"
              : "skipped";
        process.stdout.write(`${icon} [${status}] ${action.description}\n`);
        if (action.error) {
          process.stdout.write(
            `    ${theme.error(icons.error)} ${action.error}\n`
          );
        }
      }

      process.stdout.write(
        `\n${theme.heading("Summary:")} ${report.summary.total} issues found — ` +
          `${report.summary.applied} applied, ${report.summary.skipped} skipped, ${report.summary.failed} failed\n`
      );
    }

    if (report.summary.failed > 0) {
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    s.stop("Fix scan failed");
    const message = err instanceof Error ? err.message : String(err);
    formatError(message, opts);
    process.exitCode = ExitCode.ERROR;
  }
}

// ---------------------------------------------------------------------------
// Subcommand: check submodule-gitignore
// ---------------------------------------------------------------------------

/**
 * Result of the submodule gitignore check.
 */
interface SubmoduleGitignoreResult {
  valid: boolean;
  issues: string[];
  fixed: string[];
  workersChecked: number;
}

/**
 * Check and fix submodule .gitignore files for all workers.
 *
 * - Ensures each worker has a proper .gitignore
 * - Verifies critical entries exist (wrangler.jsonc, .dev.vars, etc.)
 * - Untracks wrangler.jsonc if it's mistakenly tracked by git
 */
async function checkSubmoduleGitignore(
  _opts: FormatOptions
): Promise<SubmoduleGitignoreResult> {
  const workerDirs = await getWorkerDirs();
  const issues: string[] = [];
  const fixed: string[] = [];

  for (const workerDir of workerDirs) {
    const workerName = path.basename(workerDir);
    const gitignorePath = path.join(workerDir, ".gitignore");

    // 1. Check if .gitignore exists
    const gitignoreFile = Bun.file(gitignorePath);
    if (!(await gitignoreFile.exists())) {
      // Create standard .gitignore
      await Bun.write(gitignorePath, WORKER_GITIGNORE_TEMPLATE);
      fixed.push(`${workerName}: created .gitignore`);
      continue;
    }

    // 2. Read and check critical entries
    const content = await gitignoreFile.text();
    const lines = content.split("\n").map((l) => l.trim());

    for (const entry of CRITICAL_GITIGNORE_ENTRIES) {
      if (!lines.includes(entry)) {
        issues.push(`${workerName}: missing "${entry}" in .gitignore`);
      }
    }

    // 3. Check if wrangler.jsonc is tracked by git (it shouldn't be)
    const wranglerPath = path.join(workerDir, "wrangler.jsonc");
    const wranglerFile = Bun.file(wranglerPath);
    if (await wranglerFile.exists()) {
      try {
        const tracked = await isGitTracked(workerDir, "wrangler.jsonc");
        if (tracked) {
          await gitUntrackFile(workerDir, "wrangler.jsonc");
          fixed.push(
            `${workerName}: removed wrangler.jsonc from git tracking (git rm --cached)`
          );
        }
      } catch {
        // git ls-files may fail if not in a git repo or other issues
        // Skip this check gracefully
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    fixed,
    workersChecked: workerDirs.length,
  };
}

/**
 * Handle the `hoox check submodule-gitignore` subcommand.
 */
async function handleSubmoduleGitignore(opts: FormatOptions): Promise<void> {
  const s = spinner();

  try {
    s.start("Checking submodule .gitignore files...");
    const result = await checkSubmoduleGitignore(opts);
    s.stop("Gitignore check complete");

    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            valid: result.valid,
            issues: result.issues,
            fixed: result.fixed,
            workersChecked: result.workersChecked,
          },
          null,
          2
        ) + "\n"
      );
    } else {
      if (result.issues.length > 0) {
        process.stdout.write(`\n${theme.error(icons.error)} Issues found:\n`);
        for (const issue of result.issues) {
          process.stdout.write(`  ${theme.error(icons.error)} ${issue}\n`);
        }
      }

      if (result.fixed.length > 0) {
        process.stdout.write(`\n${theme.success(icons.success)} Fixed:\n`);
        for (const fix of result.fixed) {
          process.stdout.write(`  ${theme.success(icons.success)} ${fix}\n`);
        }
      }

      if (result.issues.length === 0 && result.fixed.length === 0) {
        process.stdout.write(
          `${theme.success(icons.success)} All workers have valid .gitignore files\n`
        );
      }

      process.stdout.write(
        `\n${theme.dim(`Checked ${result.workersChecked} worker(s)`)}\n`
      );
    }

    if (!result.valid) {
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    s.stop("Gitignore check failed");
    const message = err instanceof Error ? err.message : String(err);
    formatError(message, opts);
    process.exitCode = ExitCode.ERROR;
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `hoox check` command group with subcommands:
 * setup, health, fix, submodule-gitignore.
 */
export function registerCheckCommand(program: Command): void {
  const checkCmd = program
    .command("check")
    .summary("Validate, health-check, and repair your Hoox setup")
    .description(
      `Validate your Hoox setup and check for common issues.

CHECK CATEGORIES:
  Config        - wrangler.jsonc structure, global settings, worker paths
  Infrastructure - D1 databases, KV namespaces, R2 buckets, Queues
  Secrets       - Local and remote secret configuration
  Database      - Database existence and table schema

EXAMPLES:
  hoox check setup                    Full system validation
  hoox check health                   Check worker connectivity
  hoox check fix                       Auto-repair common issues
  hoox check submodule-gitignore       Fix worker .gitignore files
  hoox check sg                       Alias for submodule-gitignore`
    );

  // -- check setup -----------------------------------------------------------
  checkCmd
    .command("setup")
    .summary("Full system validation")
    .description(
      `Run a comprehensive validation of your entire Hoox setup.

Checks performed:
  1. Config       - wrangler.jsonc validation, global settings, worker paths
  2. Infrastructure - D1 databases, KV namespaces, R2 buckets, Queues
  3. Secrets      - Local (.dev.vars) and remote (Cloudflare) secrets
  4. Database     - Database existence and required tables

OUTPUT:
  Returns a detailed report with pass/fail status for each check.
  Use --json for machine-readable output.

EXAMPLES:
  hoox check setup
  hoox check setup --json`
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleSetup(opts);
        },
        { service: "check" }
      )
    );

  // -- check health ----------------------------------------------------------
  checkCmd
    .command("health")
    .summary("Check worker connectivity and responsiveness")
    .description(
      `Run health checks on all enabled workers to verify they are running and responsive.

Each worker is probed with a short HTTP GET to /health (default timeout 8s):
  - Worker URL from global.subdomain_prefix (or account id)
  - healthy  → HTTP 2xx from /health
  - degraded → reachable but non-2xx (e.g. 4xx)
  - down     → timeout, DNS, or network error

OPTIONS:
  --fix    Attempt automatic repair for detected issues (informational)

OUTPUT:
  Returns a table showing each worker's status: healthy, degraded, or down.

EXAMPLES:
  hoox check health
  hoox check health --json
  hoox check health --fix`
    )
    .option("--fix", "Attempt automatic repair for detected issues")
    .action(
      withErrorHandling(
        async (options: { fix?: boolean }, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleHealth(opts, Boolean(options.fix));
        },
        { service: "check" }
      )
    );

  // -- check fix -------------------------------------------------------------
  checkCmd
    .command("fix")
    .summary("Auto-repair common issues")
    .description(
      `Automatically repair known common issues in your Hoox setup.

Repairs performed:
  1. Missing .dev.vars files - Creates placeholder files for local development
  2. Missing nodejs_compat flag - Adds compatibility_flags to wrangler.jsonc
  3. Missing name field - Ensures each worker has a name in wrangler.jsonc

OPTIONS:
  --dry-run    Preview changes without applying them

EXAMPLES:
  hoox check fix                Apply fixes automatically
  hoox check fix --dry-run     Preview what would be fixed`
    )
    .option("--dry-run", "Preview changes without applying them")
    .action(
      withErrorHandling(
        async (options: { dryRun?: boolean }, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleFix(opts, Boolean(options.dryRun));
        },
        { service: "check" }
      )
    );

  // -- check prerequisites --------------------------------------------------
  registerPrerequisitesCommand(checkCmd);

  // -- check submodule-gitignore ---------------------------------------------
  checkCmd
    .command("submodule-gitignore")
    .alias("sg")
    .summary("Validate and fix worker submodule .gitignore files")
    .description(
      `Validate and fix .gitignore files in worker submodules.

Ensures each worker has a proper .gitignore that excludes:
  - .dev.vars (local secrets)
  - wrangler.jsonc (worker config)
  - .wrangler/ (wrangler cache)
  - node_modules/ (dependencies)
  - IDE and OS files

Also removes wrangler.jsonc from git tracking if mistakenly tracked.

EXAMPLES:
  hoox check submodule-gitignore
  hoox check sg  # alias`
    )
    .action(
      withErrorHandling(
        async (_, cmd: Command) => {
          const opts = getFormatOptions(cmd);
          await handleSubmoduleGitignore(opts);
        },
        { service: "check" }
      )
    );
}
