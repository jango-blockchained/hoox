/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper: attach a preAction update check to a Command (or its subcommands).
 *
 * Used by `hoox dev` and `hoox deploy` to remind users about outdated
 * wrangler versions before they kick off a long-running operation. Lives
 * here (not inline in `index.ts`) so each command owns its own hook and
 * a subcommand rename can't silently disable the check.
 */

import type { Command } from "commander";
import { UpdateService } from "../services/update/index.js";

/**
 * Attach the auto-update preAction hook to the given subcommand name(s)
 * on the parent command. Skips silently if a subcommand can't be found.
 *
 * @param parent  The parent `hoox dev` / `hoox deploy` command.
 * @param subcommandNames  Subcommand names to attach to.
 * @param getYes  Resolves whether the user passed `-y/--yes`.
 */
export function attachUpdateCheck(
  parent: Command,
  subcommandNames: string[],
  getYes: () => boolean
): void {
  for (const name of subcommandNames) {
    const sub = parent.commands.find((c) => c.name() === name);
    if (!sub) continue;
    sub.hook("preAction", async () => {
      const service = new UpdateService();
      await service.checkAndPromptUpdate({ yes: getYes() });
    });
  }
}
