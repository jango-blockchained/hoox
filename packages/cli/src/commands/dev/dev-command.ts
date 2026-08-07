/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox dev` command group — local development for workers and dashboard.
 *
 * Subcommands:
 *   start     — Launch all workers with wrangler dev
 *   worker    — Start a single worker with wrangler dev
 *   dashboard — Start the Next.js dashboard dev server
 */

import { Command } from "commander";
import { select } from "@clack/prompts";
import path from "node:path";
import { ConfigService } from "../../services/config/index.js";
import { CloudflareService } from "../../services/cloudflare/index.js";
import { PrerequisitesService } from "../../services/prerequisites/index.js";
import { DockerService } from "../../services/docker/index.js";
import {
  formatSuccess,
  formatError,
  getFormatOptions,
} from "../../utils/formatters.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `hoox dev` command group with subcommands:
 * start, worker <name>, dashboard.
 */
export function registerDevCommand(program: Command): void {
  const devCmd = program
    .command("dev")
    .summary("Local development commands for workers and dashboard")
    .description(
      `Start local development servers for your Hoox workers and dashboard.

RUNTIME OPTIONS:
  native  - Uses wrangler dev (default, recommended for most cases)
  docker  - Uses Docker Compose (requires Docker + docker-compose)

The CLI will prompt you to choose a runtime if Docker is available and no preference is saved. Your choice is saved to wrangler.jsonc for future runs.

EXAMPLES:
  hoox dev start                    Start all workers (prompts for runtime)
  hoox dev start --runtime native  Force native runtime (wrangler dev)
  hoox dev start --runtime docker  Force Docker runtime
  hoox dev worker trade-worker      Start single worker
  hoox dev dashboard                Start dashboard dev server`
    );

  // -- dev start ------------------------------------------------------------
  devCmd
    .command("start")
    .summary("Start all enabled workers for local development")
    .description(
      `Start all enabled workers using either wrangler dev (native) or Docker Compose.

The command checks for prerequisites (wrangler version, Docker availability) and starts workers on sequential ports starting at 8787.

PORT ASSIGNMENTS:
  hoox               → 8787
  trade-worker       → 8788
  d1-worker          → 8789
  telegram-worker    → 8790
  web3-wallet-worker → 8792
  pyne-worker        → 8799 (Python Workers; prefer host wrangler)
  (other workers)    → 8800+

OPTIONS:
  --runtime <native|docker>  Choose dev runtime (overrides saved preference)

EXAMPLES:
  hoox dev start
  hoox dev start --runtime native
  hoox dev start --runtime docker`
    )
    .option(
      "--runtime <native|docker>",
      "Choose dev runtime (overrides saved preference)"
    )
    .action(
      withErrorHandling(
        async (options: { runtime?: string }, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          const configService = new ConfigService();
          const prereqs = new PrerequisitesService();
          const docker = new DockerService();

          // Load config early so we can read saved runtime preference
          await configService.load();

          // === Prerequisite checks ===

          // 1. Wrangler version check (advisory)
          const wranglerCheck = await prereqs.checkWranglerVersion();
          if (wranglerCheck.outdated) {
            process.stdout.write(
              `\n! wrangler is outdated (${wranglerCheck.current} < ${wranglerCheck.minimum})\n` +
                `   Run \`bunx wrangler update\` to update.\n` +
                `   Press Enter to continue or Ctrl+C to abort.\n\n`
            );
            // Wait briefly — user can proceed with Enter or Ctrl+C
          }

          // 2. Check Docker availability
          const dockerStatus = await docker.checkAvailability();
          const dockerViable = dockerStatus.docker && dockerStatus.compose;
          const composeExists = await docker.composeFileExists();

          // 3. Determine runtime
          let runtime: "native" | "docker" = "native";
          if (options.runtime === "native" || options.runtime === "docker") {
            runtime = options.runtime;
          } else {
            const savedRuntime = configService.getDevRuntime();
            if (savedRuntime) {
              runtime = savedRuntime;
            } else if (dockerViable && composeExists) {
              const choice = await select({
                message: "Which runtime would you like to use?",
                options: [
                  {
                    value: "native",
                    label: "Native (wrangler dev)",
                    hint: "run locally with wrangler",
                  },
                  {
                    value: "docker",
                    label: "Docker",
                    hint: "run via docker compose",
                  },
                ],
              });
              if (choice === "native" || choice === "docker") {
                runtime = choice;
                await configService.setDevRuntime(runtime);
              }
            }
          }

          // Validate configuration
          const validation = configService.validate();
          if (!validation.valid) {
            formatError(
              new CLIError(
                `Invalid configuration:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`,
                ExitCode.INVALID_USAGE
              ),
              fmt
            );
            process.exitCode = ExitCode.INVALID_USAGE;
            return;
          }

          // === Runtime branching ===

          if (runtime === "docker") {
            const profiles = ["workers"];
            formatSuccess(
              `Starting workers via Docker Compose (profiles: ${profiles.join(", ")})...`,
              fmt
            );
            const result = await docker.composeUp(profiles, false);
            if (!result.ok) {
              formatError(
                new CLIError(
                  result.error ?? "Docker compose failed",
                  ExitCode.ERROR
                ),
                fmt
              );
              process.exitCode = ExitCode.ERROR;
            }
            return;
          }

          // === Native runtime (wrangler dev) ===

          const enabledWorkers = configService.listEnabledWorkers();
          if (enabledWorkers.length === 0) {
            formatError(
              new CLIError(
                "No enabled workers found in wrangler.jsonc. Enable at least one worker.",
                ExitCode.INVALID_USAGE
              ),
              fmt
            );
            process.exitCode = ExitCode.INVALID_USAGE;
            return;
          }

          // Port assignments for known workers (from local-dev.md)
          const LOCAL_PORTS: Record<string, number> = {
            hoox: 8787,
            "trade-worker": 8788,
            "d1-worker": 8789,
            "telegram-worker": 8790,
            "web3-wallet-worker": 8792,
          };

          let nextFallbackPort = 8800;
          const cf = new CloudflareService();
          let started = 0;
          let failed = 0;

          for (const name of enabledWorkers) {
            const worker = configService.getWorker(name);
            if (!worker) {
              formatError(
                `Worker "${name}" not found in config, skipping.`,
                fmt
              );
              failed++;
              continue;
            }

            const port = LOCAL_PORTS[name] ?? nextFallbackPort++;
            formatSuccess(
              `Starting worker "${name}" (${worker.path}) on port ${port}...`,
              fmt
            );

            const result = await cf.dev(worker.path, port);
            if (!result.ok) {
              formatError(
                `Failed to start worker "${name}": ${result.error}`,
                fmt
              );
              failed++;
            } else {
              formatSuccess(
                `Worker "${name}" running on http://localhost:${result.value.port}`,
                fmt
              );
              started++;
            }
          }

          if (started > 0) {
            formatSuccess(
              `Started ${started} worker(s) — http://localhost:8787 (and adjacent ports)`,
              fmt
            );
          }
          if (failed > 0) {
            process.exitCode = ExitCode.ERROR;
          }
        },
        { service: "dev" }
      )
    );

  // -- dev worker <name> [--port] -------------------------------------------
  devCmd
    .command("worker <name>")
    .summary("Start a single worker for local development")
    .description(
      `Start a specific worker using wrangler dev.

ARGUMENTS:
  name          Worker name (e.g., trade-worker, agent-worker, hoox)

OPTIONS:
  --port <port>           Dev server port (default: 8787)
  --runtime <native|docker>  Choose dev runtime (overrides saved preference)

EXAMPLES:
  hoox dev worker trade-worker
  hoox dev worker agent-worker --port 8788
  hoox dev worker hoox --runtime docker`
    )
    .option("--port <port>", "Dev server port (default: 8787)", (v: string) =>
      parseInt(v, 10)
    )
    .option(
      "--runtime <native|docker>",
      "Choose dev runtime (overrides saved preference)"
    )
    .action(
      withErrorHandling(
        async (
          name: string,
          options: { port?: number; runtime?: string },
          cmd: Command
        ) => {
          const fmt = getFormatOptions(cmd);
          const configService = new ConfigService();
          await configService.load();

          // Validate the worker exists in config
          const worker = configService.getWorker(name);
          if (!worker) {
            formatError(
              new CLIError(
                `Worker "${name}" not found in wrangler.jsonc.\n` +
                  `Available workers: ${configService.listWorkers().join(", ")}`,
                ExitCode.INVALID_USAGE
              ),
              fmt
            );
            process.exitCode = ExitCode.INVALID_USAGE;
            return;
          }

          if (!worker.enabled) {
            formatError(
              new CLIError(
                `Worker "${name}" is disabled. Enable it with the config command first.`,
                ExitCode.INVALID_USAGE
              ),
              fmt
            );
            process.exitCode = ExitCode.INVALID_USAGE;
            return;
          }

          const port = options.port ?? 8787;

          formatSuccess(
            `Starting worker "${name}" (${worker.path}) on port ${port}...`,
            fmt
          );

          const cf = new CloudflareService();
          const result = await cf.dev(worker.path, port);

          if (!result.ok) {
            formatError(
              new CLIError(
                `Failed to start worker "${name}": ${result.error}`,
                ExitCode.ERROR
              ),
              fmt
            );
            process.exitCode = ExitCode.ERROR;
            return;
          }

          formatSuccess(
            `Worker "${name}" running on http://localhost:${result.value.port}`,
            fmt
          );
        },
        { service: "dev" }
      )
    );

  // -- dev dashboard --------------------------------------------------------
  devCmd
    .command("dashboard")
    .summary("Start the Next.js dashboard dev server")
    .description(
      `Start the Hoox dashboard development server using Next.js.

The dashboard runs on http://localhost:3000 with hot-reloading enabled.

OPTIONS:
  --runtime <native|docker>  Choose dev runtime (overrides saved preference)

EXAMPLES:
  hoox dev dashboard
  hoox dev dashboard --runtime docker`
    )
    .option(
      "--runtime <native|docker>",
      "Choose dev runtime (overrides saved preference)"
    )
    .action(
      withErrorHandling(
        async (_options, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          const dashboardPath = path.resolve(
            process.cwd(),
            "workers/dashboard"
          );
          const dashboardDir = Bun.file(dashboardPath);

          if (!(await dashboardDir.exists())) {
            formatError(
              new CLIError(
                `Dashboard directory not found: ${dashboardPath}`,
                ExitCode.INVALID_USAGE
              ),
              fmt
            );
            process.exitCode = ExitCode.INVALID_USAGE;
            return;
          }

          formatSuccess("Starting Next.js dashboard dev server...", fmt);

          // Fire-and-forget: spawn `bun run dev` inside pages/dashboard
          Bun.spawn(["bun", "run", "dev"], {
            cwd: dashboardPath,
            stdout: "inherit",
            stderr: "inherit",
          });

          formatSuccess("Dashboard starting on http://localhost:3000", fmt);
        },
        { service: "dev" }
      )
    );
}
