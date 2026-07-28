/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hoox CLI theme — refined ansis palette + icon set.
 *
 * Visual identity is "modern minimal" (Vercel / Linear / Turborepo):
 *   - Muted zinc base for text
 *   - Single indigo accent (no cyan/magenta clash)
 *   - De-saturated status colors (emerald / rose / amber / sky)
 *   - No high-contrast background chips; badges use colored text
 *
 * Every public name from the previous theme is preserved; only the
 * values change. This is a visual-only refactor.
 */

import ansis from "ansis";

// ── Color primitives (hex) ─────────────────────────────────────────
// Using hex codes instead of named ansis colors for the new tokens
// because ansis v4.2.0 only ships the 16 ANSI base colors by name.

const HEX = {
  // Base / text (zinc scale)
  text200: "#e4e4e7",
  text400: "#a1a1aa",
  text500: "#71717a",
  text600: "#52525b",
  text700: "#3f3f46",
  // Accent (indigo)
  indigo300: "#a5b4fc",
  indigo400: "#818cf8",
  // Status
  emerald400: "#34d399",
  rose400: "#fb7185",
  amber400: "#fbbf24",
  sky400: "#38bdf8",
} as const;

// ── Semantic theme ────────────────────────────────────────────────
export const theme = {
  // Text (zinc scale)
  text: ansis.hex(HEX.text200),
  textMuted: ansis.hex(HEX.text400),
  textSubtle: ansis.hex(HEX.text500),
  textFaint: ansis.hex(HEX.text600),

  // Borders
  border: ansis.hex(HEX.text700),
  borderStrong: ansis.hex(HEX.text600),

  // Status
  success: ansis.hex(HEX.emerald400),
  error: ansis.hex(HEX.rose400),
  warning: ansis.hex(HEX.amber400),
  info: ansis.hex(HEX.sky400),
  accent: ansis.hex(HEX.indigo400),
  highlight: ansis.hex(HEX.indigo300),

  // Surfaces (no background by default; reserved for future card use)
  surface: ansis.hex("#18181b"),

  // Backward-compatible names with new values
  dim: ansis.hex(HEX.text400),
  bold: ansis.bold,
  italic: ansis.italic,
  underline: ansis.underline,
  gray: ansis.gray,
  white: ansis.white,
  black: ansis.black,
  heading: ansis.hex(HEX.indigo400).bold,
  label: ansis.hex(HEX.text500),
  subtle: ansis.hex(HEX.text500),
  muted: ansis.hex(HEX.text600),
  value: ansis.hex(HEX.text200),
  key: ansis.hex(HEX.text500),

  // Status-specific (now colored text, no background)
  statusOk: ansis.hex(HEX.emerald400)("✓") + " " + ansis.hex(HEX.text200)("ok"),
  statusWarn:
    ansis.hex(HEX.amber400)("⚠") + " " + ansis.hex(HEX.text200)("warn"),
  statusError:
    ansis.hex(HEX.rose400)("✗") + " " + ansis.hex(HEX.text200)("error"),
  statusInfo: ansis.hex(HEX.sky400)("ℹ") + " " + ansis.hex(HEX.text200)("info"),

  // Decorations — box-drawing primitives, named by position so consumers
  // (banner.ts, menu.ts) don't have to hand-roll them with theme.textFaint.
  separator: ansis.hex(HEX.text600)("─"),
  pipe: ansis.hex(HEX.text600)("│"),
  box: {
    topLeft: ansis.hex(HEX.text600)("┌"),
    topRight: ansis.hex(HEX.text600)("┐"),
    bottomLeft: ansis.hex(HEX.text600)("└"),
    bottomRight: ansis.hex(HEX.text600)("┘"),
    horizontal: ansis.hex(HEX.text600)("─"),
    vertical: ansis.hex(HEX.text600)("│"),
  },
} as const;

// ── Icons ─────────────────────────────────────────────────────────
export const icons = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
  arrow: "→",
  // Braille dots — 10-frame cycle, the de-facto standard in modern CLIs.
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  dot: "●",
  // Added in this revision:
  sep: "·",
  bullet: "•",
  pipe: "│",
} as const;

// ── Display helpers ───────────────────────────────────────────────

/** Strip ANSI escape codes from a string. */
export function stripAnsi(str: string): string {
  return ansis.strip(str);
}

/** Render a horizontal rule using the separator character. */
export function hr(width: number = 60): string {
  return theme.separator.repeat(width);
}

/** Format a key-value pair for aligned output. */
export function kv(key: string, value: string): string {
  return `${theme.key(key)} ${theme.dim(":")} ${theme.value(value)}`;
}

/** Format a labeled value. */
export function tagged(label: string, value: string): string {
  return `${theme.key(label)} ${theme.dim(":")} ${theme.value(value)}`;
}
