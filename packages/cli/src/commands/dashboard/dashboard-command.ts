/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox dashboard` — Dashboard operations.
 *
 * Subcommands:
 *   dev          Start the dashboard dev server (alias for 'hoox dev dashboard')
 *   deploy       Build and deploy the dashboard (alias for 'hoox deploy dashboard')
 *
 * Aliases re-parse the root program in-process so PATH does not need a
 * globally installed `hoox` binary.
 */

import type { Command } from "commander";
import { withErrorHandling } from "../../utils/error-handler.js";

/** Forward root global flags into a nested parseAsync argv list. */
function withGlobalFlags(program: Command, args: string[]): string[] {
  const opts = program.opts() as {
    json?: boolean;
    quiet?: boolean;
    yes?: boolean;
    color?: boolean;
  };
  const out: string[] = [];
  if (opts.json) out.push("--json");
  if (opts.quiet) out.push("--quiet");
  if (opts.yes) out.push("--yes");
  // Commander stores --no-color as color: false
  if (opts.color === false) out.push("--no-color");
  out.push(...args);
  return out;
}

export function registerDashboardCommand(program: Command): void {
  const dashboardCmd = program
    .command("dashboard")
    .summary("Dashboard operations (dev, deploy)")
    .description(
      `Dashboard operations.

SUBCOMMANDS:
  dev          Start the dashboard dev server
  deploy       Build and deploy the dashboard

For updating internal service URLs in the dashboard config, use:
  hoox deploy update-internal-urls

EXAMPLES:
  hoox dashboard dev                      Start dashboard dev server
  hoox dashboard deploy                   Build and deploy the dashboard
  hoox dashboard deploy --rebuild         Force rebuild before deploy
`
    );

  dashboardCmd
    .command("dev")
    .description(
      "Start the dashboard dev server (alias for 'hoox dev dashboard')"
    )
    .action(
      withErrorHandling(
        async () => {
          await program.parseAsync(
            withGlobalFlags(program, ["dev", "dashboard"]),
            { from: "user" }
          );
        },
        { service: "dashboard" }
      )
    );

  dashboardCmd
    .command("deploy")
    .description(
      "Build and deploy the dashboard (alias for 'hoox deploy dashboard')"
    )
    .option("--rebuild", "Force rebuild before deploying")
    .option(
      "--auto",
      "Skip dashboard rebuild prompt, use existing build if available"
    )
    .action(
      withErrorHandling(
        async (options: { rebuild?: boolean; auto?: boolean }) => {
          const args = ["deploy", "dashboard"];
          if (options.rebuild) args.push("--rebuild");
          if (options.auto) args.push("--auto");
          await program.parseAsync(withGlobalFlags(program, args), {
            from: "user",
          });
        },
        { service: "dashboard" }
      )
    );
}
