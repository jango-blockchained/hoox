/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox keys` — Manage internal auth keys for inter-worker communication.
 *
 * Top-level alias for `hoox config keys …`, registered in-process
 * (no PATH re-spawn of the `hoox` binary).
 *
 * Commands:
 *   generate     Generate new internal keys
 *   list         List existing keys
 */

import type { Command } from "commander";
import { registerKeysSubcommands } from "../config/keys-subcommands.js";

export function registerKeysCommand(program: Command): void {
  const cmd = program
    .command("keys")
    .summary("Manage internal auth keys")
    .description(
      `Generate and manage internal auth keys for inter-worker communication.

Keys are stored in the .keys/ directory (add to .gitignore).

COMMANDS:
  generate      Generate new internal keys (writes to .keys/)
  list          List existing keys

EXAMPLES:
  hoox keys generate
  hoox keys list`
    );

  registerKeysSubcommands(cmd, "keys");
}
