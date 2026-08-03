/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox deploy` command group — deploy workers and dashboard to Cloudflare.
 *
 * Subcommands:
 *   all       — Deploy all enabled workers, then the dashboard
 *   workers   — Deploy all enabled workers with spinner + summary table
 *   worker    — Deploy a single worker with optional --env flag
 *   dashboard — Build and deploy the Next.js dashboard via OpenNext
 *   history   — Show deployment version history for a worker
 *   rollback  — Rollback a worker to a previous version
 */
import { Command } from "commander";
import { spinner, log, select, confirm, isCancel } from "@clack/prompts";
import { ConfigService } from "../../services/config/index.js";
import { CloudflareService } from "../../services/cloudflare/index.js";
import { theme, icons } from "../../utils/theme.js";
import {
  formatSuccess,
  formatError,
  formatTable,
  formatDuration,
  formatBadge,
  type FormatOptions,
  getFormatOptions,
} from "../../utils/formatters.js";
import { runRichTasks, type RichTaskResult } from "../../utils/rich.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import type { DeployResult } from "./types.js";
import {
  statSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";
import { TelegramService } from "./telegram-service.js";
import { EnvService } from "../../services/env/index.js";
import * as jsonc from "jsonc-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if dashboard build exists and get its modification date.
 * Returns null if no build exists.
 */
function getDashboardBuildInfo(dashboardPath: string): {
  exists: boolean;
  lastModified?: Date;
  age?: string;
} {
  const workerPath = resolve(dashboardPath, ".open-next", "worker.js");

  if (!existsSync(workerPath)) {
    return { exists: false };
  }

  const stats = statSync(workerPath);
  const lastModified = stats.mtime;
  const now = new Date();
  const ageMs = now.getTime() - lastModified.getTime();
  const ageMinutes = Math.floor(ageMs / 60000);
  const ageHours = Math.floor(ageMinutes / 60);
  const ageDays = Math.floor(ageHours / 24);

  let age: string;
  if (ageDays > 0) {
    age = `${ageDays} day${ageDays > 1 ? "s" : ""} ago`;
  } else if (ageHours > 0) {
    age = `${ageHours} hour${ageHours > 1 ? "s" : ""} ago`;
  } else if (ageMinutes > 0) {
    age = `${ageMinutes} minute${ageMinutes > 1 ? "s" : ""} ago`;
  } else {
    age = "just now";
  }

  return { exists: true, lastModified, age };
}

/**
 * Ask user whether to rebuild or use existing build.
 * Returns:
 *   - "rebuild" if user wants to rebuild
 *   - "deploy" if user wants to use existing build
 *   - "cancel" if user wants to abort
 */
async function promptRebuildDecision(buildInfo: {
  exists: boolean;
  lastModified?: Date;
  age?: string;
}): Promise<"rebuild" | "deploy" | "cancel"> {
  if (!buildInfo.exists) {
    return "rebuild"; // No build exists, auto-build
  }

  const choice = await select({
    message: `Dashboard was last built ${buildInfo.age}. What would you like to do?`,
    options: [
      {
        value: "rebuild",
        label: "Build new (recommended)",
        hint: "rebuild before deploy",
      },
      {
        value: "deploy",
        label: "Deploy existing",
        hint: `from ${buildInfo.age}`,
      },
      { value: "cancel", label: "Cancel", hint: "go back" },
    ],
  });

  if (choice === undefined || choice === "cancel") {
    return "cancel";
  }

  return choice as "rebuild" | "deploy";
}

/**
 * Deploy a single worker via CloudflareService.deploy().
 * Returns a DeployResult summarizing the outcome.
 */
async function deploySingle(
  configService: ConfigService,
  cf: CloudflareService,
  workerName: string,
  env?: string
): Promise<DeployResult> {
  const workerConfig = configService.getWorker(workerName);

  if (!workerConfig) {
    return {
      worker: workerName,
      success: false,
      error: `Worker "${workerName}" not found in wrangler.jsonc`,
    };
  }

  const result = await cf.deploy(workerConfig.path, env);

  if (result.ok) {
    const rawLine = result.value.rawOutput
      ?.split("\n")
      .find((l) => l.trim())
      ?.trim();
    return {
      worker: workerName,
      url: result.value.url,
      success: true,
      size: result.value.size,
      startupTime: result.value.startupTime,
      versionId: result.value.versionId,
      rawOutput: rawLine,
    };
  }

  return {
    worker: workerName,
    success: false,
    error: result.error,
  };
}

/**
 * Published deployment order. Follows the dependency chain documented in
 * docs/setup_and_operations.md so that service bindings are available
 * before dependent workers are deployed.
 */
const DEPLOY_ORDER: string[] = [
  "analytics-worker",
  "d1-worker",
  "telegram-worker",
  "web3-wallet-worker",
  "email-worker",
  "trade-worker",
  "agent-worker",
  "hoox",
  "dashboard",
];

/**
 * Deploy all enabled workers + dashboard with interactive progress UI.
 *
 * Uses `runRichTasks` for the per-item checklist with timing, success/error
 * status, and an optional post-task details block. The `DeployResult[]` return
 * shape is preserved so callers (and the `--json` / quiet paths) are
 * unaffected.
 */
async function deployAll(
  configService: ConfigService,
  cf: CloudflareService,
  env?: string,
  forceRebuildDashboard: boolean = false,
  autoMode: boolean = false,
  format: FormatOptions = {}
): Promise<DeployResult[]> {
  // Get enabled workers and sort by deployment order
  const enabled = configService.listEnabledWorkers();
  const workers = DEPLOY_ORDER.filter(
    (w) => w !== "dashboard" && enabled.includes(w)
  );
  // Append any unknown workers (not in DEPLOY_ORDER) at the end
  const unknown = enabled.filter(
    (w) => w !== "dashboard" && !DEPLOY_ORDER.includes(w)
  );
  const allItems = [...workers, ...unknown, "dashboard"];

  if (allItems.length === 0) {
    return [];
  }

  // Build the task list (deferred execution — we capture the deploy
  // function so `runRichTasks` can run + report on each one).
  const tasks = allItems.map((name) => ({
    title: name,
    run: async (): Promise<DeployResult> => {
      if (name === "dashboard") {
        return await deployDashboard(cf, forceRebuildDashboard, true, autoMode);
      }
      return await deploySingle(configService, cf, name, env);
    },
    details: (r: DeployResult): Record<string, string> => {
      if (!r.success) return { error: r.error ?? "unknown" };
      const d: Record<string, string> = {};
      if (r.url) d.URL = r.url;
      if (r.size) d.Size = r.size;
      if (r.startupTime) d.Startup = r.startupTime;
      if (r.versionId) d.Version = r.versionId.slice(0, 8) + "…";
      if (Object.keys(d).length === 0 && r.rawOutput) {
        d.Output = r.rawOutput.slice(0, 80);
      }
      return d;
    },
  }));

  const richResults = await runRichTasks<DeployResult>(tasks, {
    title: `Deploying ${allItems.length} item(s)`,
    format,
    onSummary: (results: RichTaskResult<DeployResult>[]) =>
      renderDeploySummary(results, format),
  });

  // Preserve the legacy DeployResult[] contract for callers.
  return richResults.map((r) => r.value!).filter(Boolean);
}

/**
 * Render the default post-deploy summary table: Worker / Status / URL / Size /
 * Duration. Suppressed in --json / --quiet modes by the caller.
 */
function renderDeploySummary(
  results: RichTaskResult<DeployResult>[],
  format: FormatOptions
): void {
  if (format.json || format.quiet) return;
  const rows = results.map((r) => {
    const d = r.value;
    return {
      Worker: r.title,
      Status: r.ok
        ? formatBadge("ok", "DEPLOYED")
        : formatBadge("err", "FAILED"),
      URL: d?.url ?? theme.dim("—"),
      Size: d?.size ?? theme.dim("—"),
      Duration: formatDuration(r.ms),
    };
  });
  formatTable(rows, {});
}

/**
 * Build and deploy the dashboard (workers/dashboard) via OpenNext + wrangler.
 * @param silentMode If true, skips prompt and header for use in deployAll
 */
async function deployDashboard(
  _cf: CloudflareService,
  forceRebuild: boolean = false,
  silentMode: boolean = false,
  autoMode: boolean = false
): Promise<DeployResult> {
  const dashboardPath = "workers/dashboard";

  // Check existing build status
  const buildInfo = getDashboardBuildInfo(dashboardPath);

  // Determine action based on build status and user choice
  let action: "rebuild" | "deploy" | "cancel";
  if (forceRebuild) {
    action = "rebuild";
  } else if (autoMode) {
    action = buildInfo.exists ? "deploy" : "rebuild";
  } else if (silentMode) {
    action = "rebuild";
  } else {
    action = await promptRebuildDecision(buildInfo);
  }

  // Handle cancel
  if (action === "cancel") {
    return {
      worker: "dashboard",
      success: false,
      error: "Cancelled by user",
    };
  }

  // Only show header if not in silent mode (deployAll handles its own UI)
  if (!silentMode) {
    process.stdout.write(`\n${theme.heading("Deploying Dashboard")}\n`);
    process.stdout.write(`${theme.dim("─".repeat(50))}\n`);
    process.stdout.write(`${theme.dim("○")} dashboard\n`);
    process.stdout.write(`${theme.dim("─".repeat(50))}\n\n`);
  }

  // Use clack spinner
  const actionText =
    action === "rebuild" ? "Building & deploying" : "Deploying";
  const s = spinner();

  try {
    s.start(`${actionText} dashboard...`);

    if (action === "rebuild") {
      // Build + Deploy: bun run deploy (runs opennext:build && opennext:deploy)
      const buildProc = Bun.spawn(["bun", "run", "deploy"], {
        cwd: dashboardPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const buildExit = await buildProc.exited;
      const output = await new Response(buildProc.stdout).text();

      if (buildExit !== 0) {
        const error = await new Response(buildProc.stderr).text();
        s.stop(`${theme.error(icons.error)} dashboard failed`);
        if (!silentMode) {
          process.stdout.write(
            `   ${theme.dim("Error:")} ${error.split("\n")[0]}\n`
          );
        }
        return {
          worker: "dashboard",
          success: false,
          error: `Dashboard deploy exited with code ${buildExit}`,
        };
      }

      // Parse output for metrics
      const sizeMatch = output.match(
        /Total Upload:\s*([\d.]+)\s*([KMGT]?i?B)/i
      );
      const startupMatch = output.match(/Worker Startup Time:\s*(\d+)\s*ms/i);
      const urlMatch = output.match(
        /https?:\/\/dashboard\.[a-zA-Z0-9-]+\.workers\.dev/
      );

      s.stop(`${theme.success(icons.success)} dashboard deployed`);

      if (!silentMode) {
        if (urlMatch) {
          process.stdout.write(`   ${theme.dim("URL:")} ${urlMatch[0]}\n`);
        }
        if (sizeMatch) {
          process.stdout.write(
            `   ${theme.dim("Size:")} ${sizeMatch[1]} ${sizeMatch[2]}\n`
          );
        }
        if (startupMatch) {
          process.stdout.write(
            `   ${theme.dim("Startup:")} ${startupMatch[1]} ms\n`
          );
        }
      }

      return {
        worker: "dashboard",
        url: urlMatch?.[0],
        success: true,
        size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : undefined,
        startupTime: startupMatch ? `${startupMatch[1]} ms` : undefined,
      };
    } else {
      // Deploy only (no build)
      const deployProc = Bun.spawn(["bun", "run", "opennext:deploy"], {
        cwd: dashboardPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const deployExit = await deployProc.exited;
      const output = await new Response(deployProc.stdout).text();

      if (deployExit !== 0) {
        const error = await new Response(deployProc.stderr).text();
        s.stop(`${theme.error(icons.error)} dashboard failed`);
        if (!silentMode) {
          process.stdout.write(
            `   ${theme.dim("Error:")} ${error.split("\n")[0]}\n`
          );
        }
        return {
          worker: "dashboard",
          success: false,
          error: `Dashboard deploy exited with code ${deployExit}`,
        };
      }

      const urlMatch = output.match(
        /https?:\/\/dashboard\.[a-zA-Z0-9-]+\.workers\.dev/
      );

      s.stop(`${theme.success(icons.success)} dashboard deployed`);

      if (!silentMode) {
        if (urlMatch) {
          process.stdout.write(`   ${theme.dim("URL:")} ${urlMatch[0]}\n`);
        }
      }

      return {
        worker: "dashboard",
        url: urlMatch?.[0],
        success: true,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    s.stop(`${theme.error(icons.error)} dashboard failed`);
    if (!silentMode) {
      process.stdout.write(`   ${theme.dim("Error:")} ${message}\n`);
    }
    return {
      worker: "dashboard",
      success: false,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Telegram webhook handler
// ---------------------------------------------------------------------------

async function doTelegramWebhook(
  fmt: FormatOptions,
  token?: string,
  secretToken?: string,
  subdomain?: string
): Promise<void> {
  try {
    // Resolve subdomain from flag or config
    let prefix = subdomain;
    if (!prefix) {
      const config = new ConfigService();
      await config.load();
      const global = config.getGlobal();
      prefix = global.subdomain_prefix ?? "hoox";
    }

    // Resolve bot token from flag or .env.local
    let botToken = token;
    if (!botToken) {
      const envVars = await EnvService.loadDotEnvAsync(".env.local");
      botToken = envVars["TG_BOT_TOKEN_BINDING"];
    }
    if (!botToken) {
      formatError(
        new CLIError(
          "Telegram bot token not found. Provide --token or set TG_BOT_TOKEN_BINDING in .env.local",
          ExitCode.ERROR
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
      return;
    }

    // Resolve secret token from flag or .env.local
    let webhookSecret = secretToken;
    if (!webhookSecret) {
      const envVars = await EnvService.loadDotEnvAsync(".env.local");
      webhookSecret = envVars["TELEGRAM_SECRET_TOKEN"];
    }
    if (!webhookSecret) {
      formatError(
        new CLIError(
          "Telegram secret token not found. Provide --secret-token or set TELEGRAM_SECRET_TOKEN in .env.local",
          ExitCode.ERROR
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
      return;
    }

    // Check current webhook status
    const telegram = new TelegramService();
    const webhookUrl = `https://telegram-worker.${prefix}.workers.dev/webhook`;

    const info = await telegram.getWebhookInfo(botToken);
    if (info.ok && info.url) {
      process.stdout.write(`${theme.dim("Current webhook:")} ${info.url}\n`);
      if (info.pending_update_count !== undefined) {
        process.stdout.write(
          `${theme.dim("Pending updates:")} ${info.pending_update_count}\n`
        );
      }
    }

    // Set webhook
    process.stdout.write(
      `${theme.info("Setting webhook to:")} ${webhookUrl}\n`
    );
    const result = await telegram.setWebhook(
      botToken,
      webhookUrl,
      webhookSecret
    );

    if (result.ok) {
      formatSuccess("Telegram webhook set successfully", fmt);
      if (result.description)
        process.stdout.write(`  ${theme.dim(result.description)}\n`);
    } else {
      formatError(
        new CLIError(
          `Telegram webhook failed: ${result.error || result.description || "Unknown error"}`,
          ExitCode.ERROR
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
    }
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

// ---------------------------------------------------------------------------
// Update internal URLs handler
// ---------------------------------------------------------------------------

async function doUpdateInternalUrls(fmt: FormatOptions): Promise<void> {
  try {
    const config = new ConfigService();
    await config.load();
    const global = config.getGlobal();
    const prefix = global.subdomain_prefix ?? "hoox";
    const workers = config.listEnabledWorkers();

    // Only check workers/dashboard (pages/dashboard is deprecated)
    const filePath = resolve(
      process.cwd(),
      "workers",
      "dashboard",
      "wrangler.jsonc"
    );
    if (!existsSync(filePath)) {
      formatError(
        new CLIError(
          "Dashboard wrangler.jsonc not found at workers/dashboard/wrangler.jsonc",
          ExitCode.ERROR
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
      return;
    }

    const content = readFileSync(filePath, "utf-8");
    const errors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(content, errors) as Record<string, unknown>;
    if (errors.length > 0) {
      formatError(
        new CLIError(
          "Invalid JSONC in dashboard wrangler.jsonc",
          ExitCode.ERROR
        ),
        fmt
      );
      process.exitCode = ExitCode.ERROR;
      return;
    }

    const vars = (parsed.vars as Record<string, string>) ?? {};
    let changesCount = 0;

    for (const name of workers) {
      const key = `${name.toUpperCase().replace(/-/g, "_")}_URL`;
      const newUrl = `https://${name}.${prefix}.workers.dev`;
      if (vars[key] !== newUrl) {
        if (!fmt.quiet) {
          process.stdout.write(
            `  ${theme.info("→")} ${key}: ${vars[key] ?? "(not set)"} ${theme.dim("→")} ${newUrl}\n`
          );
        }
        vars[key] = newUrl;
        changesCount++;
      }
    }

    if (changesCount === 0) {
      formatSuccess("All service URLs already up to date.", fmt);
      return;
    }

    const fresh = readFileSync(filePath, "utf-8");
    const edits = jsonc.modify(fresh, ["vars"], vars, {
      formattingOptions: { tabSize: 2, insertSpaces: true },
    });
    // Atomic write (write to temp, then rename) to avoid TOCTOU races
    // when other tools edit the file concurrently.
    const tmpPath = `${filePath}.tmp-${process.pid}`;
    writeFileSync(tmpPath, jsonc.applyEdits(fresh, edits), "utf-8");
    renameSync(tmpPath, filePath);
    formatSuccess(
      `Updated ${changesCount} service URL(s) in dashboard wrangler.jsonc`,
      fmt
    );
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

// ---------------------------------------------------------------------------
// KV config handler
// ---------------------------------------------------------------------------

async function doKvConfig(fmt: FormatOptions): Promise<void> {
  try {
    const { KvSyncService } =
      await import("../../services/kv/kv-sync-service.js");
    const kvSync = new KvSyncService();

    process.stdout.write(`${theme.info("Resolving CONFIG_KV namespace...")}\n`);
    const namespaceId = await kvSync.resolveNamespaceId();
    const manifest = KvSyncService.getManifest();
    let setCount = 0;
    let errorCount = 0;

    for (const entry of manifest.keys) {
      const value = entry.default;
      if (!value || value === "") {
        if (!fmt.quiet) {
          process.stdout.write(
            `  ${theme.dim("·")} ${entry.key} ${theme.dim("(no default, skipping)")}\n`
          );
        }
        continue;
      }
      try {
        await kvSync.set(namespaceId, entry.key, value);
        if (!fmt.quiet) {
          process.stdout.write(`  ${theme.success("✓")} ${entry.key}\n`);
        }
        setCount++;
      } catch (err) {
        process.stdout.write(
          `  ${theme.error("✗")} ${entry.key}: ${err instanceof Error ? err.message : String(err)}\n`
        );
        errorCount++;
      }
    }

    process.stdout.write(`\n${setCount} key(s) set, ${errorCount} error(s)\n`);
    if (errorCount > 0) process.exitCode = ExitCode.ERROR;
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err), fmt);
    process.exitCode = ExitCode.ERROR;
  }
}

// ---------------------------------------------------------------------------
// Deployment version history handler
// ---------------------------------------------------------------------------

/**
 * Show deployment version history for a worker via `wrangler versions list`.
 */
async function doVersionHistory(
  worker: string,
  fmt: FormatOptions
): Promise<void> {
  const s = spinner();
  s.start(`Fetching deployment history for ${worker}...`);

  const cf = new CloudflareService();
  const result = await cf.versionsList(worker);

  if (!result.ok) {
    s.stop(`${theme.error(icons.error)} Failed to fetch history`);
    formatError(new CLIError(result.error, ExitCode.ERROR), fmt);
    process.exitCode = ExitCode.ERROR;
    return;
  }

  const versions = result.value;
  s.stop(`${theme.success(icons.success)} ${versions.length} version(s) found`);

  if (versions.length === 0) {
    if (!fmt.quiet) {
      process.stdout.write(`${theme.dim("No deployment history found.\n")}`);
    }
    return;
  }

  const rows = versions.map((v) => ({
    "Version ID": v.id,
    Number: v.number !== undefined ? String(v.number) : "-",
    Created: v.created_on ? new Date(v.created_on).toLocaleString() : "-",
    Author: v.author ?? "-",
    Source: v.source ?? "-",
  }));

  formatTable(rows, fmt);
}

// ---------------------------------------------------------------------------
// Deployment rollback handler
// ---------------------------------------------------------------------------

/**
 * Rollback a worker to a previous version via `wrangler versions rollback`.
 * If no version is specified, prompts the user to select from recent versions.
 */
async function doVersionRollback(
  worker: string,
  version: string | undefined,
  fmt: FormatOptions,
  yes: boolean
): Promise<void> {
  const cf = new CloudflareService();
  let targetVersion = version;

  // If no version specified, fetch recent versions and prompt
  if (!targetVersion) {
    const s = spinner();
    s.start(`Fetching recent versions for ${worker}...`);

    const result = await cf.versionsList(worker);

    if (!result.ok) {
      s.stop(`${theme.error(icons.error)} Failed to fetch versions`);
      formatError(new CLIError(result.error, ExitCode.ERROR), fmt);
      process.exitCode = ExitCode.ERROR;
      return;
    }

    const versions = result.value;
    if (versions.length === 0) {
      s.stop(`${theme.dim("No versions found")}`);
      process.stdout.write(
        `${theme.dim("No deployment history found for this worker.\n")}`
      );
      return;
    }

    s.stop(`${theme.success(icons.success)} Versions fetched`);

    // Show the most recent 5 versions for the user to pick from
    const recent = versions.slice(0, 5);

    const selected = await select({
      message: `Select a version to roll ${worker} back to:`,
      options: recent.map((v) => ({
        value: v.id,
        label: `v${v.number ?? "?"}  ${v.id.slice(0, 8)}...  ${v.created_on ? new Date(v.created_on).toLocaleDateString() : "?"}`,
        hint: v.source ? `via ${v.source}` : undefined,
      })),
    });

    if (isCancel(selected)) {
      process.stdout.write(`${theme.dim("Rollback cancelled.\n")}`);
      return;
    }

    targetVersion = selected as string;
  }

  // Confirmation prompt before rollback
  if (!yes) {
    const confirmed = await confirm({
      message: `Roll back ${worker} to version ${targetVersion}? This will replace the current deployment.`,
    });

    if (isCancel(confirmed) || !confirmed) {
      process.stdout.write(`${theme.dim("Rollback cancelled.\n")}`);
      return;
    }
  }

  // Execute the rollback
  const s = spinner();
  s.start(`Rolling back ${worker} to version ${targetVersion}...`);

  const rollResult = await cf.versionsRollback(worker, targetVersion);

  if (!rollResult.ok) {
    s.stop(`${theme.error(icons.error)} Rollback failed`);
    formatError(new CLIError(rollResult.error, ExitCode.ERROR), fmt);
    process.exitCode = ExitCode.ERROR;
    return;
  }

  s.stop(
    `${theme.success(icons.success)} ${worker} rolled back to ${targetVersion.slice(0, 8)}...`
  );

  // Show a brief snippet of wrangler output
  if (rollResult.value && !fmt.quiet) {
    const snippet = rollResult.value
      .split("\n")
      .find((l) => l.trim())
      ?.trim()
      .slice(0, 120);
    if (snippet) {
      log.step(`  ${theme.dim("Output:")} ${snippet}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `hoox deploy` command group with subcommands:
 * all, workers, worker <name>, dashboard, telegram-webhook,
 * update-internal-urls, kv-config, history <worker>, rollback <worker>.
 */
export function registerDeployCommand(program: Command): void {
  const deployCmd = program
    .command("deploy")
    .summary("Deploy workers and/or dashboard to Cloudflare Workers")
    .description(
      `Deploy your Hoox trading system to Cloudflare's edge network.

The deploy command handles building and uploading your workers and dashboard to Cloudflare Workers.

DEPLOYMENT ORDER:
Workers are deployed in the correct order based on their dependencies (e.g., d1-worker before trade-worker).

DASHBOARD:
The dashboard uses OpenNext to convert Next.js to Cloudflare Workers format. Before deploying, the CLI checks for an existing build and prompts you to rebuild or use the existing build.

EXAMPLES:
  hoox deploy all                    Deploy everything (workers + dashboard)
  hoox deploy all --rebuild          Force rebuild dashboard before deploying
  hoox deploy workers                Deploy workers only (skip dashboard)
  hoox deploy worker trade-worker    Deploy a specific worker
  hoox deploy dashboard             Deploy dashboard only`
    );

  // -- deploy all ----------------------------------------------------------
  deployCmd
    .command("all")
    .summary("Deploy all enabled workers, then the dashboard")
    .description(
      `Deploy all enabled workers to Cloudflare Workers, then build and deploy the Next.js dashboard.

This is the recommended command for production deployments as it ensures all components are deployed in the correct order.

OPTIONS:
  --env <env>     Target environment (production, staging, etc.)
  --rebuild       Force rebuild of dashboard before deploying (skip prompt)
  --auto          Skip dashboard rebuild prompt, use existing build if available

EXAMPLES:
  hoox deploy all
  hoox deploy all --env production
  hoox deploy all --rebuild
  hoox deploy all --auto`
    )
    .option("--env <env>", "Cloudflare environment (e.g. production, staging)")
    .option("--rebuild", "Force rebuild of dashboard before deploying")
    .option(
      "--auto",
      "Skip dashboard rebuild prompt, use existing build if available"
    )
    .option("--dry-run", "Preview deployment plan without executing")
    .action(
      withErrorHandling(
        async (
          options: {
            env?: string;
            rebuild?: boolean;
            auto?: boolean;
            dryRun?: boolean;
          },
          cmd: Command
        ) => {
          const configService = new ConfigService();
          await configService.load();
          const format = getFormatOptions(cmd);

          // --dry-run: preview deployment plan without executing
          if (options.dryRun) {
            const enabled = configService.listEnabledWorkers();
            const workers = DEPLOY_ORDER.filter(
              (w) => w !== "dashboard" && enabled.includes(w)
            );
            const unknown = enabled.filter(
              (w) => w !== "dashboard" && !DEPLOY_ORDER.includes(w)
            );
            const ordered = [...workers, ...unknown];

            process.stdout.write(
              `\n${theme.heading("Deployment Plan (dry-run)")}\n`
            );
            process.stdout.write(`${theme.dim("─".repeat(50))}\n`);
            process.stdout.write(
              `Workers to deploy (${ordered.length + unknown.length}):\n`
            );
            for (const w of [...ordered, ...unknown]) {
              process.stdout.write(`  ${theme.dim("○")} ${w}\n`);
            }

            // Dashboard build info
            const buildInfo = getDashboardBuildInfo("workers/dashboard");
            if (buildInfo.exists) {
              process.stdout.write(
                `\nDashboard: ${buildInfo.age ? `build exists (${buildInfo.age})` : "build exists"}\n`
              );
            } else {
              process.stdout.write(
                `\nDashboard: no build found (will be built)\n`
              );
            }

            process.stdout.write(
              `\n${theme.dim("Run without --dry-run to deploy.")}\n`
            );
            return;
          }

          const cf = new CloudflareService();

          // Deploy all (workers + dashboard) in one go
          await deployAll(
            configService,
            cf,
            options.env,
            options.rebuild ?? false,
            options.auto ?? false,
            format
          );
        },
        { service: "deploy" }
      )
    );

  // -- deploy workers ------------------------------------------------------
  deployCmd
    .command("workers")
    .summary("Deploy all enabled workers to Cloudflare")
    .description(
      `Deploy all enabled workers to Cloudflare Workers.

Workers are deployed in the correct order based on their dependencies. This command skips the dashboard deployment.

OPTIONS:
  --env <env>     Target environment (production, staging, etc.)

EXAMPLES:
  hoox deploy workers
  hoox deploy workers --env staging`
    )
    .option("--env <env>", "Cloudflare environment (e.g. production, staging)")
    .action(
      withErrorHandling(
        async (options: { env?: string }) => {
          const configService = new ConfigService();
          await configService.load();
          const cf = new CloudflareService();

          // Deploy only workers (no dashboard), sorted by dependency order
          const enabled = configService.listEnabledWorkers();
          const workers = DEPLOY_ORDER.filter(
            (w) => w !== "dashboard" && enabled.includes(w)
          );
          const unknown = enabled.filter(
            (w) => w !== "dashboard" && !DEPLOY_ORDER.includes(w)
          );
          const ordered = [...workers, ...unknown];
          const results: DeployResult[] = [];

          if (ordered.length === 0) {
            process.stdout.write(
              `${theme.dim("No enabled workers to deploy\n")}`
            );
            return;
          }

          // Print header
          process.stdout.write(`\n${theme.heading("Deploying Workers")}\n`);
          process.stdout.write(`${theme.dim("─".repeat(60))}\n`);

          for (const name of ordered) {
            process.stdout.write(
              `${theme.dim("○")} ${name.padEnd(25)} pending\n`
            );
          }
          process.stdout.write(`${theme.dim("─".repeat(60))}\n\n`);

          // Deploy each worker with clack spinner
          for (const name of ordered) {
            const s = spinner();
            s.start(`Deploying ${name}...`);

            const result = await deploySingle(
              configService,
              cf,
              name,
              options.env
            );
            results.push(result);

            if (result.success) {
              s.stop(`${theme.success(icons.success)} ${name} deployed`);
              if (result.url)
                process.stdout.write(
                  `   ${theme.dim("URL:")}     ${result.url}\n`
                );
              if (result.size)
                process.stdout.write(
                  `   ${theme.dim("Size:")}     ${result.size}\n`
                );
              if (result.startupTime)
                process.stdout.write(
                  `   ${theme.dim("Startup:")} ${result.startupTime}\n`
                );
              if (result.versionId)
                process.stdout.write(
                  `   ${theme.dim("Version:")} ${result.versionId.slice(0, 8)}...\n`
                );
              if (
                !result.url &&
                !result.size &&
                !result.startupTime &&
                !result.versionId &&
                result.rawOutput
              ) {
                process.stdout.write(
                  `   ${theme.dim("Output:")}  ${result.rawOutput.slice(0, 80)}\n`
                );
              }
            } else {
              s.stop(`${theme.error(icons.error)} ${name} failed`);
              if (result.error)
                process.stdout.write(
                  `   ${theme.error("Error:")} ${result.error}\n`
                );
            }
          }

          const succeeded = results.filter((r) => r.success).length;
          const failed = results.filter((r) => !r.success).length;
          process.stdout.write(
            `\n${theme.heading("Summary:")} ${succeeded}/${ordered.length} deployed`
          );
          if (failed > 0)
            process.stdout.write(` ${theme.error(`(${failed} failed)`)}\n`);
          else process.stdout.write(` ${theme.success(" ✓")}\n\n`);
        },
        { service: "deploy" }
      )
    );

  // -- deploy worker <name> ------------------------------------------------
  deployCmd
    .command("worker <name>")
    .summary("Deploy a single worker by name")
    .description(
      `Deploy a specific worker to Cloudflare Workers.

ARGUMENTS:
  name          Worker name (e.g., trade-worker, agent-worker, hoox)

OPTIONS:
  --env <env>   Target environment (production, staging, etc.)

EXAMPLES:
  hoox deploy worker trade-worker
  hoox deploy worker agent-worker --env production`
    )
    .option("--env <env>", "Cloudflare environment (e.g. production, staging)")
    .action(
      withErrorHandling(
        async (name: string, options: { env?: string }, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          const configService = new ConfigService();
          await configService.load();
          const cf = new CloudflareService();

          const result = await deploySingle(
            configService,
            cf,
            name,
            options.env
          );

          if (result.success) {
            const url = result.url ? ` — ${result.url}` : "";
            formatSuccess(`Deployed ${name}${url}`, fmt);
          } else {
            formatError(
              new CLIError(
                `Failed to deploy "${name}": ${result.error}`,
                ExitCode.ERROR
              ),
              fmt
            );
            process.exitCode = ExitCode.ERROR;
          }
        },
        { service: "deploy" }
      )
    );

  // -- deploy dashboard ----------------------------------------------------
  deployCmd
    .command("dashboard")
    .summary("Build and deploy the Next.js dashboard")
    .description(
      `Build and deploy the Hoox dashboard to Cloudflare Workers.

The dashboard is built using OpenNext which converts Next.js to Cloudflare Workers format. Before deploying, the CLI checks for an existing build and prompts you to rebuild or use the existing build.

OPTIONS:
  --rebuild       Force rebuild of dashboard before deploying (skip prompt)

EXAMPLES:
  hoox deploy dashboard              Interactive: choose to rebuild or use existing
  hoox deploy dashboard --rebuild    Force rebuild before deploying`
    )
    .option("--rebuild", "Force rebuild of dashboard before deploying")
    .action(
      withErrorHandling(
        async (options: { rebuild?: boolean }, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          const cf = new CloudflareService();

          const result = await deployDashboard(cf, options.rebuild);

          if (result.success) {
            const url = result.url ? ` — ${result.url}` : "";
            formatSuccess(`Dashboard deployed${url}`, fmt);
          } else {
            formatError(
              new CLIError(
                `Dashboard deployment failed: ${result.error}`,
                ExitCode.ERROR
              ),
              fmt
            );
            process.exitCode = ExitCode.ERROR;
          }
        },
        { service: "deploy" }
      )
    );

  // -- deploy telegram-webhook --------------------------------------------

  deployCmd
    .command("telegram-webhook")
    .summary("Set Telegram bot webhook (post-deploy step)")
    .description(
      `Configure the Telegram bot webhook after deploying telegram-worker.

Calls the Telegram Bot API to set the webhook URL.

ARGUMENTS:
  --token <token>           Telegram bot token (from @BotFather)
  --secret-token <token>    Telegram webhook secret token
  --subdomain <prefix>      Worker subdomain prefix (default: from config)

By default, the bot token and secret are read from .env local.
Use --token and --secret-token to override.

EXAMPLES:
  hoox deploy telegram-webhook
  hoox deploy telegram-webhook --token 123456:ABC-DEF1234
  hoox deploy telegram-webhook --subdomain myapp`
    )
    .option("--token <token>", "Telegram bot token (from @BotFather)")
    .option("--secret-token <secret>", "Telegram webhook secret token")
    .option(
      "--subdomain <prefix>",
      "Worker subdomain prefix (default: from config)"
    )
    .action(
      withErrorHandling(
        async (
          options: {
            token?: string;
            secretToken?: string;
            subdomain?: string;
          },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          await doTelegramWebhook(
            fmt,
            options.token,
            options.secretToken,
            options.subdomain
          );
        },
        { service: "deploy" }
      )
    );

  // -- deploy update-internal-urls ---------------------------------------

  deployCmd
    .command("update-internal-urls")
    .summary("Update dashboard wrangler.jsonc with current service URLs")
    .description(
      `Update the dashboard's wrangler.jsonc with the current service URLs.

This is a post-deployment step that ensures the dashboard has correct
service binding URLs for all workers.

EXAMPLES:
  hoox deploy update-internal-urls`
    )
    .action(
      withErrorHandling(
        async (_options, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doUpdateInternalUrls(fmt);
        },
        { service: "deploy" }
      )
    );

  // -- deploy kv-config --------------------------------------------------

  deployCmd
    .command("kv-config")
    .summary("Apply KV manifest keys post-deployment")
    .description(
      `Apply the KV manifest key-value pairs after deploying workers.

Sets all KV keys from the manifest to their default values.
This post-deployment step initializes the CONFIG_KV namespace.

EXAMPLES:
  hoox deploy kv-config`
    )
    .action(
      withErrorHandling(
        async (_options, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doKvConfig(fmt);
        },
        { service: "deploy" }
      )
    );

  // -- deploy history <worker> -------------------------------------------

  deployCmd
    .command("history <worker>")
    .summary("Show deployment version history for a worker")
    .description(
      `Display the deployment version history for a Cloudflare Worker.

Shows version ID, version number, creation date, author, and source for each deployment.

ARGUMENTS:
  name          Worker name (e.g., trade-worker, agent-worker)

EXAMPLES:
  hoox deploy history trade-worker
  hoox deploy history hoox --json`
    )
    .action(
      withErrorHandling(
        async (worker: string, _options, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doVersionHistory(worker, fmt);
        },
        { service: "deploy" }
      )
    );

  // -- deploy rollback <worker> [version] --------------------------------

  deployCmd
    .command("rollback <worker>")
    .argument(
      "[version]",
      "Version ID to rollback to (if omitted, prompts to select)"
    )
    .summary("Rollback a worker to a previous version")
    .description(
      `Rollback a Cloudflare Worker to a previous version.

If no version is specified, the CLI fetches the 5 most recent versions
and prompts you to select one.

ARGUMENTS:
  name          Worker name (e.g., trade-worker, agent-worker)
  version       Version ID to rollback to (optional)

OPTIONS:
  --yes         Skip confirmation prompt

EXAMPLES:
  hoox deploy rollback trade-worker
  hoox deploy rollback trade-worker <version-id>
  hoox deploy rollback trade-worker <version-id> --yes`
    )
    .option("--yes", "Skip confirmation prompt")
    .action(
      withErrorHandling(
        async (
          worker: string,
          version: string | undefined,
          options: { yes?: boolean },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          await doVersionRollback(worker, version, fmt, options.yes ?? false);
        },
        { service: "deploy" }
      )
    );
}
