/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox workers` command group — facade for worker management.
 *
 * Subcommands:
 *   list             — List all workers with enabled/disabled status, path, secrets count
 *   dev <name>       — Delegate to `hoox dev worker <name>`
 *   logs <name>      — Delegate to `hoox logs worker <name>`
 *
 * Note: 'hoox workers status' was removed — use 'hoox check health' instead.
 */

import { Command } from "commander";
import { ConfigService } from "../../services/config/index.js";
import {
  formatTable,
  formatJson,
  getFormatOptions,
} from "../../utils/formatters.js";
import type { FormatOptions } from "../../utils/formatters.js";
import { withErrorHandling } from "../../utils/error-handler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch worker data from ConfigService and render as a list.
 * Respects --json and --quiet flags via FormatOptions.
 */
async function doListWorkers(fmt: FormatOptions): Promise<void> {
  const configService = new ConfigService();
  await configService.load();

  const workers = configService.listWorkers();

  const rows = workers.map((name) => {
    const worker = configService.getWorker(name);
    return {
      Worker: name,
      Status: worker?.enabled ? "enabled" : "disabled",
      Path: worker?.path ?? "-",
      Secrets: String(worker?.secrets?.length ?? 0),
    };
  });

  if (fmt.json) {
    formatJson(rows, fmt);
    return;
  }

  formatTable(rows, fmt);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `hoox workers` command group with subcommands:
 * list, dev <name>, logs <name>.
 */
export function registerWorkersCommand(program: Command): void {
  const workersCmd = program
    .command("workers")
    .summary("Manage Cloudflare Workers (list, dev, logs)")
    .description(
      `Manage your Hoox Cloudflare Workers.

SUBCOMMANDS:
  list              List all workers with status, path, and secrets count
  dev <name>        Start a worker for local development (delegates to dev worker)
  logs <name>       Tail logs for a specific worker (delegates to logs worker)

For health checks, use 'hoox check health'.
For deployments, use 'hoox deploy workers' or 'hoox deploy worker <name>'.

EXAMPLES:
  hoox workers list                   List all workers
  hoox workers list --json            List workers as JSON (respects global --json)
  hoox workers dev trade-worker       Start dev server for trade-worker
  hoox workers logs hoox              Tail logs for the hoox gateway`
    );

  // -- workers list ----------------------------------------------------------

  workersCmd
    .command("list")
    .summary("List all workers with their enabled/disabled status")
    .description(
      `List all workers defined in wrangler.jsonc.

Displays each worker's:
  - Name
  - Status (enabled / disabled)
  - Path (relative from project root)
  - Secrets (count of Cloudflare secrets configured)

EXAMPLES:
  hoox workers list              Default table output
  hoox workers list --json       JSON-formatted output
  hoox workers list --quiet      Minimal output`
    )
    .action(
      withErrorHandling(
        async (_opts: unknown, cmd: Command) => {
          const fmt = getFormatOptions(cmd);
          await doListWorkers(fmt);
        },
        { service: "workers" }
      )
    );

  // -- workers dev <name> ----------------------------------------------------
  // Delegates entirely to `hoox dev worker <name>`

  workersCmd
    .command("dev <name>")
    .summary("Start a single worker for local development")
    .description(
      `Start a specific worker for local development by running \`hoox dev worker <name>\` in-process.

ARGUMENTS:
  name      Worker name (e.g., trade-worker, agent-worker, hoox)

EXAMPLES:
  hoox workers dev trade-worker      Start dev server for trade-worker
  hoox workers dev hoox              Start dev server for the hoox gateway`
    )
    .action(
      withErrorHandling(
        async (name: string) => {
          // In-process re-parse (avoids PATH/stale global `hoox` / bad shell aliases)
          await program.parseAsync(["dev", "worker", name], { from: "user" });
        },
        { service: "workers" }
      )
    );

  // -- workers logs <name> ---------------------------------------------------
  // Delegates entirely to `hoox logs worker <name>`

  workersCmd
    .command("logs <name>")
    .summary("Tail logs for a specific worker")
    .description(
      `Tail logs for a specific worker by running \`hoox logs worker <name>\` in-process.

ARGUMENTS:
  name      Worker name (e.g., trade-worker, agent-worker, hoox)

EXAMPLES:
  hoox workers logs hoox             Tail logs for the hoox gateway
  hoox workers logs trade-worker     Tail logs for trade-worker`
    )
    .action(
      withErrorHandling(
        async (name: string) => {
          await program.parseAsync(["logs", "worker", name], { from: "user" });
        },
        { service: "workers" }
      )
    );
}
