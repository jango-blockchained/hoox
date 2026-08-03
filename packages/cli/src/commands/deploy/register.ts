/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public registration entry point for the `hoox deploy` command.
 *
 * Wraps `registerDeployCommand` with the auto-update preAction hook for
 * the long-running deploy subcommands (`all`, `workers`, `worker`,
 * `dashboard`). Keeps the hook inside the command's own folder so it
 * can't be silently disabled by an `index.ts` refactor.
 */
import type { Command } from "commander";
import { registerDeployCommand } from "./deploy-command.js";
import { attachUpdateCheck } from "../../utils/update-check.js";

export function register(program: Command): void {
  registerDeployCommand(program);
  const deployCmd = program.commands.find((c) => c.name() === "deploy");
  if (deployCmd) {
    attachUpdateCheck(
      deployCmd,
      ["all", "workers", "worker", "dashboard"],
      () => program.opts().yes === true
    );
  }
}
