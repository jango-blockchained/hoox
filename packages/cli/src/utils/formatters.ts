/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Output formatters for the Hoox CLI.
 * Each function respects --json / --quiet flags passed via FormatOptions.
 * Human-readable mode uses ansis styling from the theme.
 */

import ansis from "ansis";
import { CLIError, ExitCode } from "./errors.js";
import { theme, icons, stripAnsi, hr } from "./theme.js";
import { formatDuration as _formatDuration } from "./timer.js";
import { isRichMode } from "./format-mode.js";
import { Command } from "commander";

export interface FormatOptions {
  json?: boolean;
  quiet?: boolean;
  /** Suppress color even when stdout is a TTY. Honored by `isRichMode`. */
  noColor?: boolean;
}

/**
 * Options for `formatTable`. Extends `FormatOptions` with visual flags.
 */
export interface FormatTableOptions extends FormatOptions {
  /** Alternate-row text-subtle treatment. Default: true. */
  zebra?: boolean;
  /** Right-align columns where every value parses as a number. Default: true. */
  alignNumbers?: boolean;
  /** Auto-color values that match a known status word. Default: true. */
  colorizeStatus?: boolean;
  /** Drop the top/middle/bottom borders; keep a single rule under the header. */
  compact?: boolean;
}

// ── Progress bar ──────────────────────────────────────────────────

const PROGRESS_BAR_WIDTH = 30;

/** Optional ETA context for `renderProgressBar`. */
export interface ProgressBarEta {
  /** When the operation started (ms since epoch). */
  startedAt: number;
  /** Optional known total duration; if omitted, ETA is estimated from rate. */
  totalMs?: number;
}

/**
 * Render an inline progress bar string.
 * @param current  Current step (0-based)
 * @param total    Total steps
 * @param opts     Width override, or ETA context
 */
export function renderProgressBar(
  current: number,
  total: number,
  opts?: { width?: number; eta?: ProgressBarEta }
): string {
  const width = opts?.width ?? PROGRESS_BAR_WIDTH;
  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);

  const bar =
    theme.accent("[") +
    theme.success("█".repeat(filled)) +
    theme.dim("░".repeat(empty)) +
    theme.accent("]") +
    ` ${pct}%`;

  if (!opts?.eta || total === 0) return bar;

  // ETA — show elapsed / (estimated total) or elapsed / known total
  const elapsed = Date.now() - opts.eta.startedAt;
  let etaSuffix: string;
  if (opts.eta.totalMs) {
    etaSuffix = `  ${_formatDuration(elapsed)} / ${_formatDuration(opts.eta.totalMs)}`;
  } else if (current > 0) {
    const estimatedTotal = (elapsed / current) * total;
    const remaining = Math.max(0, estimatedTotal - elapsed);
    etaSuffix = `  ${_formatDuration(elapsed)} / ~${_formatDuration(estimatedTotal)} (${_formatDuration(remaining)} left)`;
  } else {
    etaSuffix = `  ${_formatDuration(elapsed)}`;
  }

  return bar + theme.dim(etaSuffix);
}

/**
 * Render a multi-line progress display for sequential steps.
 * Returns lines suitable for overwriting via \r or manual clear.
 */
export function renderStepProgress(
  steps: Array<{
    name: string;
    status: "pending" | "running" | "done" | "failed";
  }>
): string {
  const iconMap: Record<string, string> = {
    pending: theme.dim("○"),
    running: theme.info("◌"),
    done: theme.success("●"),
    failed: theme.error("✗"),
  };

  return steps
    .map((s) => `  ${iconMap[s.status]} ${theme.bold(s.name)}`)
    .join("\n");
}

// ── Polish helpers ────────────────────────────────────────────────

/**
 * Format a duration in human-readable form.
 * Re-exported from `timer.ts` so callers can import everything from
 * `formatters.js`.
 */
export const formatDuration = _formatDuration;

/** Semantic log level for `formatBadge`. */
export type BadgeLevel = "ok" | "warn" | "err" | "info";

/**
 * Per-level style for `formatBadge`.
 * `icon` is a short unicode glyph rendered in the level's color.
 * `text` is the optional `text` arg (or a default label) rendered in the
 * normal foreground — so the badge is "colored glyph + colored text" rather
 * than a high-contrast background chip.
 */
const BADGE_STYLE: Record<
  BadgeLevel,
  { icon: string; color: typeof ansis.green; defaultLabel: string }
> = {
  ok: { icon: "✓", color: ansis.green, defaultLabel: "ok" },
  warn: { icon: "⚠", color: ansis.yellow, defaultLabel: "warn" },
  err: { icon: "✗", color: ansis.red, defaultLabel: "fail" },
  info: { icon: "ℹ", color: ansis.cyan, defaultLabel: "info" },
};

/**
 * Render a short status badge (e.g. "✓ OK", "✗ FAIL") with the appropriate
 * theme color. Useful in tables and inline lists.
 *
 * Style: colored glyph (one char) + colored text label. Replaces the
 * earlier background-chip implementation to match the v0.9.0 output
 * framework (Vercel / Linear / Turborepo style).
 */
export function formatBadge(level: BadgeLevel, text?: string): string {
  const { icon, color, defaultLabel } = BADGE_STYLE[level];
  return `${color(icon)} ${color(text ?? defaultLabel)}`;
}

/**
 * Print a short, dimmed hint line below the previous output.
 * Suppressed in --json / --quiet modes.
 */
export function formatHint(hint: string, opts?: FormatOptions): void {
  if (opts?.quiet || opts?.json) return;
  if (!isRichMode(opts)) return;
  process.stdout.write(`${theme.dim("↳ hint:")} ${theme.value(hint)}\n`);
}

// ── Basic output ──────────────────────────────────────────────────

/**
 * Output a success message.
 * - JSON mode:  {"success":true,"message":"..."}
 * - Quiet mode: prints nothing
 * - Human mode: green "✓ message"
 */
export function formatSuccess(message: string, opts?: FormatOptions): void {
  if (opts?.quiet) return;

  if (opts?.json) {
    process.stdout.write(JSON.stringify({ success: true, message }) + "\n");
    return;
  }

  process.stdout.write(`${theme.success(icons.success)} ${message}\n`);
}

/**
 * Output an error message with optional card layout and "did you mean" suggestions.
 *
 * - JSON mode:  {"success":false,"error":"...","code":1,"details":"...","hint":"...","suggestions":[...]}
 * - Quiet mode: prints only the error message
 * - Human mode: card-style error with optional details, hint, suggestions
 *
 * Set `inCard: false` to skip the box framing (e.g. for inline errors).
 */
export function formatError(
  error: Error | string,
  opts: FormatOptions & { suggestions?: string[]; inCard?: boolean } = {}
): void {
  const message = typeof error === "string" ? error : error.message;
  const cliError = error instanceof CLIError ? error : null;

  if (opts.json) {
    const output: Record<string, unknown> = {
      success: false,
      error: message,
      code: cliError?.code ?? ExitCode.ERROR,
    };
    if (cliError?.details) output.details = cliError.details;
    if (cliError?.hint) output.hint = cliError.hint;
    if (opts.suggestions && opts.suggestions.length > 0) {
      output.suggestions = opts.suggestions;
    }
    process.stdout.write(JSON.stringify(output) + "\n");
    return;
  }

  if (opts.quiet) {
    process.stdout.write(`${message}\n`);
    return;
  }

  const inCard = opts.inCard !== false; // default true

  // Title line: ✗ [code] message
  const titleParts: string[] = [theme.error(icons.error)];
  if (cliError?.code !== undefined) {
    titleParts.push(theme.textSubtle(`[${cliError.code}]`));
  }
  titleParts.push(theme.text(message));
  process.stdout.write(`${titleParts.join(" ")}\n`);

  if (cliError?.details) {
    // Multi-line details (e.g. per-secret failures) render as indented bullets
    const detailLines = cliError.details
      .split("\n")
      .filter((l) => l.length > 0);
    for (const line of detailLines) {
      process.stdout.write(`  ${theme.textMuted(line)}\n`);
    }
  }

  const hasHint = !!cliError?.hint;
  const hasSuggestions = !!opts.suggestions && opts.suggestions.length > 0;

  if (hasHint || hasSuggestions) {
    if (inCard) {
      process.stdout.write(`  ${theme.border(icons.pipe)}\n`);
    }
    if (hasHint) {
      process.stdout.write(
        `  ${inCard ? theme.border(icons.pipe) : " "}  ${theme.dim("↳ hint:")} ${theme.value(cliError!.hint!)}\n`
      );
    }
    if (hasSuggestions) {
      const sugText = opts.suggestions!.map((s) => `'${s}'`).join(", ");
      process.stdout.write(
        `  ${inCard ? theme.border(icons.pipe) : " "}  ${theme.dim("did you mean:")} ${theme.accent(sugText)} ${theme.dim("?")}\n`
      );
    }
    if (inCard) {
      process.stdout.write(`  ${theme.border(icons.pipe)}\n`);
    }
  } else if (inCard && !cliError?.details) {
    // No hint / suggestions / details: still frame with a single pipe
    process.stdout.write(`  ${theme.border(icons.pipe)}\n`);
  }
}

/**
 * Output tabular data with enhanced box-drawing borders.
 *
 * - JSON mode:  JSON array of objects
 * - Quiet mode: prints nothing
 * - Human mode: themed box-drawn table with column headers
 *
 * Visual options (all default to true except `compact`):
 *   - `zebra`         alternate-row subtle text treatment
 *   - `alignNumbers`  right-align columns that are all numeric
 *   - `colorizeStatus` auto-color values matching ok/healthy/.../warn/.../err/...
 *   - `compact`       drop outer borders, keep one rule under the header
 */
export function formatTable(
  rows: Record<string, string>[],
  opts: FormatTableOptions = {}
): void {
  if (opts.quiet) return;

  if (opts.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }

  if (rows.length === 0) {
    process.stdout.write(`${theme.dim("(empty)")}\n`);
    return;
  }

  const zebra = opts.zebra !== false; // default true
  const alignNumbers = opts.alignNumbers !== false; // default true
  const colorizeStatus = opts.colorizeStatus !== false; // default true
  const compact = opts.compact === true; // default false

  // Collect all keys in display order (first row defines column order).
  const keys = Object.keys(rows[0]);

  // Pre-process cells: apply status colorization.
  const processed: Array<Record<string, string>> = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const raw = row[k] ?? "";
      out[k] = colorizeCell(raw, colorizeStatus);
    }
    return out;
  });

  // Determine which columns are numeric (for right-alignment).
  const numericColumns = new Set<string>();
  if (alignNumbers) {
    for (const k of keys) {
      let allNumeric = true;
      let anyNonEmpty = false;
      for (const row of processed) {
        const v = stripAnsi(row[k] ?? "");
        if (v.length === 0) continue;
        anyNonEmpty = true;
        if (!/^-?\d+(\.\d+)?$/.test(v)) {
          allNumeric = false;
          break;
        }
      }
      if (allNumeric && anyNonEmpty) numericColumns.add(k);
    }
  }

  // Calculate column widths (based on the visible / stripped length).
  const widths: Record<string, number> = {};
  for (const key of keys) {
    widths[key] = stripAnsi(key).length;
    for (const row of processed) {
      const value = row[key] ?? "";
      const stripped = stripAnsi(value).length;
      widths[key] = Math.max(widths[key], stripped);
    }
  }

  // Build border segments.
  const topParts = keys.map((k) => "─".repeat(widths[k] + 2));
  const topBorder = `┌${topParts.join("┬")}┐`;
  const sepBorder = `├${topParts.join("┼")}┤`;
  const botBorder = `└${topParts.join("┴")}┘`;

  // Header row with themed styling.
  const headerCells = keys.map((k) =>
    theme.bold(k.padEnd(widths[k])).toString()
  );
  const headerRow = `│ ${headerCells.join(" │ ")} │`;

  // Data rows, with zebra striping and number alignment.
  const dataRows = processed.map((row, rowIdx) => {
    const isAlt = zebra && rowIdx % 2 === 0;
    const cells = keys.map((k) => {
      const value = row[k] ?? "";
      const padded = numericColumns.has(k)
        ? value.padStart(widths[k])
        : value.padEnd(widths[k]);
      // For zebra, re-apply textSubtle to non-status cells. Status cells
      // keep their color.
      if (isAlt && !value.includes("\u001b")) {
        return theme.textMuted(padded);
      }
      return padded;
    });
    return `│ ${cells.join(" │ ")} │`;
  });

  const borderOut = compact
    ? `${headerRow}\n${theme.dim("─".repeat(stripAnsi(headerRow).length))}\n${dataRows.join("\n")}\n`
    : `${theme.dim(topBorder)}\n${headerRow}\n${theme.dim(sepBorder)}\n${dataRows.join("\n")}\n${theme.dim(botBorder)}\n`;

  process.stdout.write(borderOut);
}

/**
 * Apply status-color auto-detection to a single cell value.
 * Pure function — exposed for unit testing.
 */
function colorizeCell(value: string, colorizeStatus: boolean): string {
  if (!colorizeStatus) return value;
  const v = value.trim();
  const lower = v.toLowerCase();
  if (
    [
      "ok",
      "pass",
      "healthy",
      "operational",
      "up",
      "active",
      "enabled",
    ].includes(lower)
  ) {
    return `${theme.success(icons.success)} ${theme.text(v)}`;
  }
  if (["warn", "warning", "degraded", "partial", "pending"].includes(lower)) {
    return `${theme.warning(icons.warning)} ${theme.text(v)}`;
  }
  if (
    [
      "err",
      "error",
      "fail",
      "failed",
      "down",
      "unreachable",
      "disabled",
    ].includes(lower)
  ) {
    return `${theme.error(icons.error)} ${theme.text(v)}`;
  }
  return value;
}

/**
 * Output arbitrary data as JSON.
 * - JSON / Quiet mode: JSON stringified (compact or pretty)
 * - Human mode:    JSON with 2-space indent
 */
export function formatJson(data: unknown, opts?: FormatOptions): void {
  const json = opts?.quiet
    ? JSON.stringify(data)
    : JSON.stringify(data, null, 2);

  process.stdout.write(`${json}\n`);
}

/**
 * Output key-value pairs.
 * - JSON mode:  JSON object
 * - Quiet mode: prints nothing
 * - Human mode: "label: value" with subtle labels, padded for alignment
 */
export function formatKeyValue(
  pairs: Record<string, string>,
  opts: FormatOptions = {}
): void {
  if (opts.quiet) return;

  if (opts.json) {
    process.stdout.write(JSON.stringify(pairs, null, 2) + "\n");
    return;
  }

  const maxKeyLen = Math.max(
    ...Object.keys(pairs).map((k) => stripAnsi(k).length),
    0
  );

  for (const [key, value] of Object.entries(pairs)) {
    const paddedKey = key.padEnd(maxKeyLen);
    process.stdout.write(
      `  ${theme.key(paddedKey)} ${theme.textMuted(":")} ${value}\n`
    );
  }
}

/**
 * Output a section header with decorative separator.
 * Optionally render a dim subtitle below the rule.
 */
export function formatHeader(
  text: string,
  opts: FormatOptions & { subtitle?: string } = {}
): void {
  if (opts.quiet) return;
  if (opts.json) return;

  process.stdout.write(`\n${theme.heading(text)}\n`);
  process.stdout.write(`${hr()}\n`);
  if (opts.subtitle) {
    process.stdout.write(`${theme.textMuted(opts.subtitle)}\n\n`);
  }
}

/**
 * Output a bullet-point list with optional icon per item.
 */
export function formatList(
  items: string[],
  opts?: { icon?: string; json?: boolean; quiet?: boolean }
): void {
  if (opts?.quiet) return;

  if (opts?.json) {
    process.stdout.write(JSON.stringify(items, null, 2) + "\n");
    return;
  }

  const icon = opts?.icon ?? icons.arrow;
  for (const item of items) {
    process.stdout.write(`  ${icon} ${item}\n`);
  }
}

/**
 * Build the format options for output, reading global --json / --quiet
 * / --no-color flags. Uses `optsWithGlobals()` to include options
 * inherited from the top-level program.
 */
export function getFormatOptions(cmd: Command): FormatOptions {
  const opts = cmd.optsWithGlobals();
  return {
    json: Boolean(opts.json),
    quiet: Boolean(opts.quiet),
    // commander lowercases --no-color to `color` and negates to `false`.
    noColor: Boolean(opts.color === false),
  };
}

/**
 * Render a completion footer line(s). Used as the final output of every
 * successful command when the global `program` postAction hook fires.
 *
 * Suppressed entirely in `--json`, `--quiet`, non-TTY, NO_COLOR, and when
 * the previous command failed (process.exitCode !== 0).
 *
 * - JSON mode: prints nothing.
 * - Quiet mode: prints nothing.
 * - Human mode: a green check + message + optional duration, then an
 *   optional "→ next: ..." line with a suggested follow-up command.
 */
export function formatCompletion(
  message: string,
  opts: FormatOptions & {
    durationMs?: number;
    suggestion?: { command: string; reason?: string };
  } = {}
): void {
  // Always bail on these.
  if (opts.json || opts.quiet) return;
  if (process.exitCode && process.exitCode !== 0) return;
  if (!isRichMode(opts)) return;

  const parts: string[] = [theme.success(icons.success), theme.text(message)];

  if (opts.durationMs !== undefined) {
    parts.push(theme.textMuted(formatDuration(opts.durationMs)));
  }

  process.stdout.write(`${parts.join(" ")}\n`);

  if (opts.suggestion) {
    const reason = opts.suggestion.reason
      ? ` ${theme.textMuted(`(${opts.suggestion.reason})`)}`
      : "";
    process.stdout.write(
      `  ${theme.textMuted("→")} ${theme.textMuted("next:")} ${theme.accent(opts.suggestion.command)}${reason}\n`
    );
  }
}
