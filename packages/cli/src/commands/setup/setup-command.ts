/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox setup` — CLI command wrapper around SetupService.
 *
 * Thin CLI layer: validates args, wires @clack/prompts spinners to the
 * service's progress callback, and calls SetupService.runAll().
 */

import { Command } from "commander";
import * as p from "@clack/prompts";

import { SetupService } from "../../services/setup/index.js";
import type { ProgressEvent } from "../../services/setup/index.js";
import {
  formatError,
  formatTable,
  formatDuration,
  formatBadge,
  getFormatOptions,
} from "../../utils/formatters.js";
import { startTimer } from "../../utils/timer.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { theme } from "../../utils/theme.js";

// ---------------------------------------------------------------------------
// Progress → @clack spinner adapter
// ---------------------------------------------------------------------------

function wireProgress(
  onStart: (msg: string) => void,
  onComplete: (msg: string) => void,
  onError: (msg: string) => void
) {
  return (event: ProgressEvent) => {
    switch (event.type) {
      case "step-start":
        onStart(event.message);
        break;
      case "step-complete":
        onComplete(event.message);
        break;
      case "step-error":
        onError(event.message);
        break;
      case "secret-start":
        onStart(event.message);
        break;
      case "secret-done":
        onComplete(event.message);
        break;
      case "secret-error":
        onError(event.message);
        break;
      case "info":
        p.log.info(event.message);
        break;
      case "warn":
        p.log.warn(event.message);
        break;
      case "error":
        p.log.error(event.message);
        break;
    }
  };
}

// ---------------------------------------------------------------------------
// Dry-run display
// ---------------------------------------------------------------------------

function showDryRun(options: Record<string, unknown>): void {
  p.note("DRY RUN MODE — no changes will be made", "hoox setup");
  p.log.step("Would execute the following steps:");

  const steps: string[] = [
    "0. Pre-flight auto-repair:",
    "   - Check/install wrangler binary",
    "   - Clone missing worker submodules",
    "   - Build missing packages",
    "   - Fix null vars in wrangler.jsonc configs",
  ];

  if (!options.skipKeys) {
    steps.push("1. Generate keys → .keys/setup.env + worker .dev.vars files");
    steps.push(
      "   - INTERNAL_KEY_BINDING / AGENT / TELEGRAM / TRADE / API_SERVICE (shared mesh)"
    );
    steps.push("   - SESSION_SECRET (64-byte random hex)");
    steps.push("   - WEBHOOK_API_KEY_BINDING (32-byte random hex)");
  }
  if (!options.skipDb) {
    steps.push("2. D1 infrastructure:");
    steps.push("   - Create database if missing");
    steps.push("   - Apply schema (workers/trade-worker/schema.sql)");
  }
  if (!options.skipSecrets) {
    steps.push(
      "3. Reconcile legacy secret names (e.g. INTERNAL_SERVICE_KEY → INTERNAL_KEY_BINDING)"
    );
    steps.push("4. Set Cloudflare secrets:");
    const map: Record<string, readonly string[]> = {
      INTERNAL_KEY_BINDING: [
        "d1-worker",
        "analytics-worker",
        "trade-worker",
        "report-worker",
        "email-worker",
        "agent-worker",
        "hoox",
        "web3-wallet-worker",
        "telegram-worker",
      ],
      AGENT_INTERNAL_KEY: ["agent-worker", "dashboard"],
      SESSION_SECRET: ["dashboard"],
      WEBHOOK_API_KEY_BINDING: ["hoox"],
      TELEGRAM_INTERNAL_KEY_BINDING: ["trade-worker"],
      API_SERVICE_KEY_BINDING: ["trade-worker", "dashboard"],
      TRADE_INTERNAL_KEY: ["dashboard"],
    };
    for (const [secret, workers] of Object.entries(map)) {
      steps.push(`   - ${secret} → ${workers.join(", ")}`);
    }
  }
  if (!options.skipDashboard) {
    steps.push("5. Rebuild and deploy dashboard");
    steps.push("   - bunx opennextjs-cloudflare build");
    steps.push("   - bunx opennextjs-cloudflare deploy");
  }

  steps.push("6. Post-flight verification:");
  steps.push("   - Check all Cloudflare secrets match generated keys");
  steps.push("   - Check all .dev.vars files are current");
  steps.push("   - Detect stale/legacy secrets");

  for (const step of steps) {
    p.log.message(step);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .summary(
      "Auto-bootstrap everything: install, clone, build, keys, secrets, schema, dashboard"
    )
    .description(
      `Single-command setup that auto-detects and fixes EVERY issue:

  Pre-flight:
    • Checks/installs wrangler binary (auto: \`bun install -g wrangler\`)
    • Clones missing worker submodules (auto: \`git submodule update --init --recursive\`)
    • Builds missing packages (auto: \`bun run build\`)
    • Fixes null vars in wrangler.jsonc that block secrets

  Core steps:
    1. Generates all required internal keys
    2. Stores keys in .keys/setup.env + per-key .env files + worker .dev.vars
    3. Creates D1 database if missing, applies schema
    4. Reconciles legacy secret names (e.g., INTERNAL_SERVICE_KEY → INTERNAL_KEY_BINDING)
    5. Sets secrets on all Cloudflare Workers
    6. Rebuilds and deploys dashboard

  Post-flight:
    • Verifies all Cloudflare secrets match generated keys
    • Verifies all .dev.vars files are current
    • Detects stale/legacy secrets

Each step can be skipped independently.

EXAMPLES:
  hoox setup                          Full auto-setup (interactive)
  hoox setup --yes                    Full auto-setup (non-interactive)
  hoox setup --skip-db                Skip D1 schema apply
  hoox setup --skip-secrets           Skip setting Cloudflare secrets
  hoox setup --skip-dashboard         Skip dashboard rebuild
  hoox setup --dry-run                Show what would be done (no changes)
  hoox setup --database my-db         Use a different database name
  hoox setup --skip-keys --skip-db    Only secrets + dashboard`
    )
    .option("--skip-keys", "Skip generating and saving keys")
    .option("--skip-db", "Skip applying D1 schema")
    .option("--skip-secrets", "Skip setting Cloudflare secrets")
    .option("--skip-dashboard", "Skip rebuilding the dashboard")
    .option("--dry-run", "Show what would be done without executing")
    .option("--database <name>", "D1 database name (default: trade-data-db)")
    .action(
      withErrorHandling(
        async (options: Record<string, unknown>, cmd: Command) => {
          const globalOpts = getFormatOptions(cmd);
          const isInteractive = !globalOpts.json && !globalOpts.quiet;

          if (isInteractive) {
            p.intro(theme.heading("Hoox Auto-Setup"));
            p.note(
              "Auto-detects and fixes: missing wrangler, uncloned workers, unbuilt packages, null vars, missing D1, legacy secret names, missing .dev.vars, missing Cloudflare secrets.",
              "Auto-Repair Overview"
            );
          }

          // ── Dry run ──────────────────────────────────────────────────
          if (options.dryRun) {
            showDryRun(options);
            p.outro("Dry run complete. Run without --dry-run to execute.");
            return;
          }

          // ── Prerequisites ────────────────────────────────────────────
          const authCheck = p.spinner();
          authCheck.start("Checking Cloudflare authentication...");

          const tempSvc = new SetupService();
          const authOk = await tempSvc.checkAuth();

          if (!authOk) {
            authCheck.stop("Authentication failed");
            formatError(
              new CLIError(
                "Not authenticated with Cloudflare. Run 'wrangler login' first.",
                ExitCode.ERROR,
                undefined,
                false,
                "Run `wrangler login` interactively, or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables for CI / non-interactive use."
              ),
              globalOpts
            );
            p.outro(theme.error("Setup aborted"));
            process.exitCode = ExitCode.ERROR;
            return;
          }

          authCheck.stop("Cloudflare authenticated");

          // ── Confirmation ─────────────────────────────────────────────
          const yes = Boolean(cmd.optsWithGlobals().yes);
          if (isInteractive && !yes) {
            const confirmed = await p.confirm({
              message:
                "Proceed with auto-setup? This will modify Cloudflare resources.",
              initialValue: false,
            });
            if (p.isCancel(confirmed) || !confirmed) {
              p.cancel("Setup cancelled.");
              return;
            }
          }

          // ── Execute steps ────────────────────────────────────────────
          const opts = {
            skipKeys: Boolean(options.skipKeys),
            skipDb: Boolean(options.skipDb),
            skipSecrets: Boolean(options.skipSecrets),
            skipDashboard: Boolean(options.skipDashboard),
            database: options.database as string | undefined,
          };

          let currentSpinner: ReturnType<typeof p.spinner> | null = null;

          // Create service with progress wiring to @clack spinners
          const setupSvc = new SetupService(
            wireProgress(
              (msg) => {
                if (currentSpinner) currentSpinner.stop();
                currentSpinner = p.spinner();
                currentSpinner.start(msg);
              },
              (msg) => {
                if (currentSpinner) currentSpinner.stop(msg);
                currentSpinner = null;
              },
              (msg) => {
                if (currentSpinner) currentSpinner.stop(msg);
                currentSpinner = null;
              }
            )
          );

          const totalTimer = startTimer();
          const result = await setupSvc.runAll(opts);
          const totalMs = totalTimer.ms();

          // ── Summary ──────────────────────────────────────────────────
          if (isInteractive) {
            p.log.step(`── Summary (total ${formatDuration(totalMs)}) ──`);
            const rows = result.steps.map((s) => ({
              Step: s.step,
              Status: s.success
                ? formatBadge("ok", "DONE")
                : formatBadge("err", "FAIL"),
              Message: s.message,
            }));
            formatTable(rows, globalOpts);

            const secretFail = result.secrets?.filter((r) => !r.ok).length ?? 0;

            if (result.success) {
              p.outro("Auto-setup complete! Run: hoox check setup");
            } else {
              p.outro(
                theme.warning("Auto-setup completed with issues. ") +
                  `${secretFail} secret(s) failed. Check logs above.`
              );
              process.exitCode = ExitCode.ERROR;
            }
          } else {
            // JSON-friendly output
            const summary = {
              success: result.success,
              steps: result.steps.map((s) => ({
                step: s.step,
                success: s.success,
                message: s.message,
              })),
              secrets: result.secrets
                ? {
                    total: result.secrets.length,
                    ok: result.secrets.filter((r) => r.ok).length,
                    failed: result.secrets.filter((r) => !r.ok).length,
                  }
                : undefined,
            };
            process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
            if (!result.success) {
              process.exitCode = ExitCode.ERROR;
            }
          }
        },
        { service: "setup" }
      )
    );
}
