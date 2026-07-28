/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public registration entry point for the `hoox dev` command.
 *
 * Wraps `registerDevCommand` with the auto-update preAction hook for
 * `dev start`. The hook used to live inline in `src/index.ts`, but
 * putting it here means a subcommand rename can't silently disable the
 * check (the dev test suite still exercises `registerDevCommand`
 * directly without the hook).
 */
import type { Command } from "commander";
import { registerDevCommand } from "./dev-command.js";
import { attachUpdateCheck } from "../../utils/update-check.js";

export function register(program: Command): void {
  registerDevCommand(program);
  const devCmd = program.commands.find((c) => c.name() === "dev");
  if (devCmd) {
    attachUpdateCheck(devCmd, ["start"], () => program.opts().yes === true);
  }
}
