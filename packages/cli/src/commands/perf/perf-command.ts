/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox perf` — performance measurement command group.
 *
 * Subcommands:
 *   fastpath   Measure the deployed fast-path latency (probe-based)
 */

import type { Command } from "commander";
import { registerFastpathCommand } from "./fastpath/index.js";

export function registerPerfCommand(program: Command): void {
  const cmd = program
    .command("perf")
    .summary("Performance measurement tools")
    .description(
      `Measure latency, throughput, and other performance characteristics of
the deployed Hoox system.

SUBCOMMANDS:
  fastpath   Measure the deployed fast-path latency (probe-based)

EXAMPLES:
  hoox perf fastpath run --n 50
  hoox perf fastpath tail --duration 60`
    );

  registerFastpathCommand(cmd);
}
