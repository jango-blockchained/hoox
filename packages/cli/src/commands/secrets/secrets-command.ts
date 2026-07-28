/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox secrets` — Manage Cloudflare Worker secrets.
 *
 * Top-level alias for `hoox config secrets …`, registered in-process
 * (no PATH re-spawn of the `hoox` binary).
 *
 * Commands:
 *   list [worker]           List secrets for a worker
 *   set <worker> <name>     Set a secret
 *   delete <worker> <name>  Delete a secret
 *   sync [worker]           Sync local .dev.vars to Cloudflare
 */

import type { Command } from "commander";
import { registerSecretsSubcommands } from "../config/secrets-subcommands.js";

export function registerSecretsCommand(program: Command): void {
  const cmd = program
    .command("secrets")
    .summary("Manage Cloudflare Worker secrets")
    .description(
      `Manage secrets for your Cloudflare Workers.

Secrets are defined in wrangler.jsonc under each worker's 'secrets' array.

COMMANDS:
  list [worker]              List secrets for a worker
  set <worker> <name>        Set a secret
  delete <worker> <name>     Delete a secret
  sync [worker]              Sync local .dev.vars to Cloudflare
                             (--system / --required = mesh keys only)

EXAMPLES:
  hoox secrets list trade-worker
  hoox secrets set trade-worker BINANCE_KEY_BINDING
  hoox secrets sync --system
  hoox secrets sync`
    );

  registerSecretsSubcommands(cmd, "secrets");
}
