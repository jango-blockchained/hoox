/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom Commander.js help formatter.
 *
 * Replaces the default flat `Usage: ... \n Options: ...` layout with a
 * sectioned, color-treated layout that matches the "modern minimal"
 * aesthetic. Reads `addHelpText('after', ...)` for Examples / See also
 * blocks so existing call sites are backward compatible.
 *
 * Pure function — no side effects, takes a `Command` and the
 * `helpInformation` method (the standard Commander formatter signature).
 */

import { Command, type HelpContext } from "commander";
import { theme, stripAnsi } from "./theme.js";
import { isRichMode } from "./format-mode.js";

/**
 * Render the help text for a Commander command.
 *
 * @param cmd   - The command being asked for help.
 * @param helper - The default `helpInformation` method (kept for the
 *                 standard Commander formatter signature). In Commander
 *                 v15 this method does not include `addHelpText` content
 *                 — we use the `captureHelpEvent` helper below to
 *                 extract the after-help text via the event API.
 */
export function renderHelp(
  cmd: Command,
  helper: (this: Command, context?: HelpContext) => string
): string {
  // The `helper` parameter is the Commander Help class instance.
  // We don't need it because we walk the Command tree directly and
  // capture after-help text via the event API (see `captureHelpEvent`).
  void helper;

  // Subcommand listing, if any. The `_hidden` field is the only
  // visibility flag Commander v15 stores on a Command instance.
  const subcommands = cmd.commands
    .filter((c) => !(c as unknown as { _hidden?: boolean })._hidden)
    .map((c) => ({ name: c.name(), desc: c.description() ?? "" }));

  // Build the parts. Each part is one block of the help screen.
  const blocks: string[] = [];

  // ── Title (command name + positional arguments) ──
  const argNames = cmd.registeredArguments.map((a) => a.name()).join(" ");
  const titleName = argNames ? `${cmd.name()} ${argNames}` : cmd.name();
  blocks.push(theme.heading(` ${titleName}`));

  // ── Description ──
  if (cmd.description()) {
    blocks.push(` ${theme.textMuted(cmd.description())}`);
  }

  // ── Separator ──
  blocks.push(theme.textFaint("─".repeat(60)));

  // ── Usage ──
  const usageLine = buildUsage(cmd);
  blocks.push(headerLine("Usage"));
  blocks.push(`   ${theme.accent(usageLine)}`);

  // ── Options ──
  const options = cmd.options.filter((o) => !o.hidden);
  if (options.length > 0) {
    blocks.push("");
    blocks.push(headerLine("Options"));
    const flagWidth = Math.max(...options.map((o) => o.flags.length));
    for (const o of options) {
      const padded = o.flags.padEnd(flagWidth);
      const desc = o.description ? theme.textMuted(o.description) : "";
      blocks.push(`   ${theme.text(padded)}  ${desc}`);
    }
  }

  // ── Subcommands ──
  if (subcommands.length > 0) {
    blocks.push("");
    blocks.push(headerLine("Commands"));
    const nameWidth = Math.max(...subcommands.map((s) => s.name.length));
    for (const s of subcommands) {
      const padded = s.name.padEnd(nameWidth);
      blocks.push(`   ${theme.text(padded)}  ${theme.textMuted(s.desc)}`);
    }
  }

  // ── Examples / See also (from addHelpText('after', ...)) ──
  // Commander v15 stores `addHelpText` content as event listeners on
  // `beforeHelp` / `afterHelp`. Invoking the listener with a custom
  // context (whose `write` captures) yields the rendered text.
  const afterText = captureHelpEvent(cmd, "afterHelp");
  if (afterText.trim()) {
    blocks.push("");
    blocks.push(headerLine("Examples"));
    blocks.push(`   ${theme.textMuted(afterText.trim())}`);
  }

  // Output. If not in rich mode, strip all ansi.
  const out = blocks.join("\n") + "\n";
  return isRichMode() ? out : stripAnsi(out);
}

function headerLine(text: string): string {
  return ` ${theme.textSubtle(text)}`;
}

/** Build a usage line like "hoox deploy all [options]". */
function buildUsage(cmd: Command): string {
  const parts: string[] = [];
  let c: Command | null = cmd;
  while (c && c.name()) {
    parts.unshift(c.name());
    c = c.parent;
  }
  // Append positional arguments (e.g. "all" for `command("deploy all")`).
  for (const arg of cmd.registeredArguments) {
    parts.push(arg.name());
  }
  return `${parts.join(" ")} [options]`;
}

/**
 * Capture text emitted by a help event on a Command.
 *
 * Commander v15 stores `addHelpText` content as event listeners on
 * `beforeHelp` / `afterHelp`. Invoking the listener with a custom
 * context (whose `write` captures) yields the rendered text.
 *
 * The `emit` method is inherited from EventEmitter but is not declared
 * in Commander's public typings, so we cast through `unknown`.
 */
function captureHelpEvent(cmd: Command, eventName: string): string {
  const parts: string[] = [];
  const context = {
    error: false,
    command: cmd,
    write: (str: string) => {
      parts.push(str);
    },
  };
  const emitter = cmd as unknown as {
    emit: (event: string, payload: unknown) => boolean;
  };
  emitter.emit(eventName, context);
  return parts.join("");
}
