/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared CLI error-handling wrapper.
 *
 * Provides a `withErrorHandling()` higher-order function that wraps
 * command handlers with standardized error formatting and exit-code
 * management, eliminating duplicated try/catch blocks across commands.
 *
 * Also exports `suggestForCommand` which produces a "did you mean" hint
 * for `commander.unknownCommand` errors using Levenshtein distance.
 */

import { Command } from "commander";
import { formatError, getFormatOptions } from "./formatters.js";
import { CLIError, ExitCode } from "./errors.js";
import { levenshtein } from "./string.js";
import type { FormatOptions } from "./formatters.js";

export type CommandResult = Promise<void>;

/**
 * Levenshtein threshold for "did you mean" suggestions.
 * Distance ≤ 2 produces a suggestion; > 2 is too far.
 */
const SUGGESTION_THRESHOLD = 2;

/**
 * Walk the Commander command tree and return all reachable command
 * names (both top-level and nested). De-duplicated.
 */
function collectCommandNames(
  cmd: Command,
  acc: Set<string> = new Set()
): Set<string> {
  for (const sub of cmd.commands) {
    if (sub.name() && !(sub as { hidden?: boolean }).hidden) {
      acc.add(sub.name());
      collectCommandNames(sub, acc);
    }
  }
  return acc;
}

/**
 * Given an unknown command arg, return the closest registered command
 * name within the Levenshtein threshold, or undefined if none.
 *
 * Tolerates common user typos:
 *  - short commands (e.g. `dpl`, `inf`) — minimum length lowered to 2
 *  - accidental plurals (e.g. `deploys` → `deploy`) — a trailing "s"
 *    is stripped before comparison
 */
export function suggestForCommand(
  program: Command,
  unknown: string
): string | undefined {
  if (unknown.length < 2) return undefined; // too short to suggest reliably
  const normalized = unknown.replace(/s$/, "");
  const candidates = collectCommandNames(program);
  let best: { name: string; dist: number } | undefined;
  for (const candidate of candidates) {
    // Compare against both the raw input and the de-pluralized form so
    // `deploys` (dist 1 from `deploy` after stripping) still matches.
    const d = Math.min(
      levenshtein(unknown, candidate),
      levenshtein(normalized, candidate)
    );
    if (d > SUGGESTION_THRESHOLD) continue;
    if (!best || d < best.dist) {
      best = { name: candidate, dist: d };
    }
  }
  return best?.name;
}

/**
 * Wraps a command handler with standardized error handling.
 *
 * IMPORTANT: This wrapper sets `process.exitCode` but does NOT call
 * `process.exit()`. The Node/Bun process exit is the responsibility of
 * the CLI's top-level entry point (see `index.ts` > `main()`), which
 * lets the test runner intercept the exit via Commander's `exitOverride`
 * and makes the wrapper testable without monkey-patching `process.exit`.
 */
/**
 * Find a Commander `Command` instance among action args so we can honor
 * global `--json` / `--quiet` / `--no-color` on unexpected throws.
 */
function formatOptsFromArgs(
  args: unknown[],
  fallback?: FormatOptions
): FormatOptions {
  if (fallback) return fallback;
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (a instanceof Command) {
      return getFormatOptions(a);
    }
  }
  return {};
}

export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<void>,
  options?: { service?: string; opts?: FormatOptions }
): (...args: T) => CommandResult {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      const service = options?.service ?? "cli";
      const fmt = formatOptsFromArgs(args as unknown[], options?.opts);

      if (error instanceof CLIError) {
        formatError(error, fmt);
        process.exitCode = error.code;
        return;
      } else if (error instanceof Error) {
        formatError(
          new CLIError(`[${service}] ${error.message}`, ExitCode.ERROR),
          fmt
        );
        process.exitCode = ExitCode.ERROR;
        return;
      } else {
        formatError(
          new CLIError(
            `[${service}] Unknown error: ${String(error)}`,
            ExitCode.CommandFailed
          ),
          fmt
        );
        process.exitCode = ExitCode.CommandFailed;
        return;
      }
    }
  };
}
