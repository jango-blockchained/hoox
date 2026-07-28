/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live test inline visual dividers.
 *
 * The per-suite summary table (intro/outro + per-test pass/fail lines)
 * is now produced by `packages/test-utils/src/render-test-table.ts`,
 * wired through `bunfig.toml`'s JUnit reporter and the global preload's
 * `process.on('exit')` hook. Every `bun test` run — including live
 * tests — now ends with that unified table.
 *
 * What remains here is just the per-test visual scaffolding the live
 * suite uses to break up long describe blocks: `section()` for a bold
 * sub-heading, and `log.skip` for the graceful "env var missing" path
 * used by `skipIfMissing()` in `helpers.ts`.
 */
import { theme } from "../../packages/cli/src/utils/theme.js";

/** Skip notice — yellow ⚠, used by helpers.ts skipIfMissing(). */
export const log = {
  skip(msg: string): void {
    process.stdout.write(`  ${theme.warning("\u26A0")}  ${msg}\n`);
  },
};

/** Inline section divider — bold text on its own line. */
export function section(name: string): void {
  process.stdout.write(`\n  ${theme.bold(name)}\n`);
}
