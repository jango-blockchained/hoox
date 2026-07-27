/**
 * "What should the user do next?" lookup + path helpers for the
 * global completion hook installed in `index.ts`.
 *
 * Pure and dependency-light — imports only `commander` for `Command`.
 */

import { Command } from "commander";

/** A suggested follow-up command. */
export interface Suggestion {
  /** The command line the user should run, including the `hoox` prefix. */
  command: string;
  /** Why this is a good next step. */
  reason: string;
}

/**
 * Static map from full command path → suggested follow-up.
 * Anything not in this map gets no suggestion (graceful no-op).
 *
 * Keys are the FULL path (e.g. "deploy all"), not the leaf ("all").
 * See `getCmdPath` for how the path is computed.
 */
const SUGGEST_NEXT: Record<string, Suggestion> = {
  init: { command: "hoox setup", reason: "provision infrastructure" },
  setup: { command: "hoox deploy all", reason: "ship to Cloudflare" },
  "deploy all": { command: "hoox check health", reason: "verify the deploy" },
  "check health": {
    command: "hoox monitor trades",
    reason: "watch recent trades",
  },
  "secrets sync": {
    command: "hoox check health",
    reason: "verify workers after secret push",
  },
  "keys generate": {
    command: "hoox secrets sync --system",
    reason: "push mesh keys to Cloudflare",
  },
  "monitor kill-switch off": {
    command: "hoox check health",
    reason: "re-enable trading",
  },
};

/**
 * Look up a suggested follow-up command for the given path.
 * Returns `undefined` when no suggestion is registered.
 */
export function suggestNextCommand(
  commandPath: string
): Suggestion | undefined {
  return SUGGEST_NEXT[commandPath];
}

/**
 * Walk up the Commander command tree to get the path the user actually
 * typed. Examples:
 *   - the program root ("hoox") → ""
 *   - the "init" command     → "init"
 *   - the "all" subcommand of "deploy" → "deploy all"
 *
 * The program root itself is omitted from the path because the map
 * keys are paths RELATIVE to the root.
 */
export function getCmdPath(cmd: Command): string {
  const parts: string[] = [];
  let current: Command | null = cmd;
  while (current && current.name() && current.parent) {
    parts.unshift(current.name());
    current = current.parent;
  }
  return parts.join(" ");
}
