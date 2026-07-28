/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "commander";
import { spinner } from "@clack/prompts";
import { ConfigService } from "../../services/config/index.js";
import { UpdateService } from "../../services/update/index.js";
import { CLIError, ExitCode } from "../../utils/errors.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { theme } from "../../utils/theme.js";
import { formatDuration } from "../../utils/formatters.js";
import { startTimer } from "../../utils/timer.js";
import {
  gitPull,
  gitSubmoduleUpdate,
  isGitRepo,
  isSubmodule,
} from "../../utils/git.js";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .summary("Sync repo from GitHub or update wrangler")
    .description(
      `Update your local project from GitHub or update wrangler.

Without arguments, pulls latest changes for the main repo.
With a worker name, updates that worker's submodule from its remote.
With "wrangler", updates wrangler to the latest version.

EXAMPLES:
  hoox update              Pull latest for main repo
  hoox update d1-worker    Update the d1-worker submodule
  hoox update wrangler     Update wrangler to latest version`
    )
    .argument(
      "[target]",
      'What to update: worker name (e.g. d1-worker) or "wrangler"'
    )
    .action(
      withErrorHandling(
        async (target?: string) => {
          const cwd = process.cwd();

          if (target === "wrangler") {
            const service = new UpdateService();
            const result = await service.updateWrangler();

            if (result.error) {
              throw new CLIError(
                `Update failed: ${result.error}`,
                ExitCode.ERROR
              );
            }
            return;
          }

          if (!(await isGitRepo(cwd))) {
            throw new CLIError(
              "Not a git repository — run this command from the project root",
              ExitCode.INVALID_USAGE
            );
          }

          if (target) {
            const configService = new ConfigService();
            await configService.load();
            const worker = configService.getWorker(target);

            if (!worker) {
              throw new CLIError(
                `Unknown worker "${target}" — not found in wrangler.jsonc`,
                ExitCode.INVALID_USAGE
              );
            }

            const submodulePath = worker.path;
            if (!(await isSubmodule(cwd, submodulePath))) {
              throw new CLIError(
                `"${submodulePath}" is not a git submodule — nothing to update`,
                ExitCode.INVALID_USAGE
              );
            }

            const s = spinner();
            const t = startTimer();
            s.start(`Updating ${target}...`);

            const output = await gitSubmoduleUpdate(cwd, submodulePath);

            const dur = formatDuration(t.ms());
            s.stop(
              output
                ? theme.success(`Updated ${target} (${dur})`)
                : theme.muted(`${target} already up to date (${dur})`)
            );
          } else {
            const s = spinner();
            const t = startTimer();
            s.start("Pulling latest from remote...");

            const output = await gitPull(cwd);

            const dur = formatDuration(t.ms());
            s.stop(
              output
                ? theme.success(`Repository up to date (${dur})`)
                : theme.muted(`Already up to date (${dur})`)
            );
          }
        },
        { service: "update" }
      )
    );
}
