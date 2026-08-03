/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Color Tokens — Hoox TUI / shared design system (terminal-safe hex).
 *
 * Design DNA (2026 polish):
 *   - Near-black canvas (not warm grey)
 *   - Cool indigo / cyan accent (Grok Build–adjacent; less orange)
 *   - Squared edges (no rounding — editorial HUD aesthetic)
 *
 * Usage: import { Colors, ConnectionStatusColor } from "@hoox-sh/hoox-shared"
 *        <text fg={Colors.accent}>Important</text>
 */

export const Colors = {
  // Base — true black stack
  background: "#050508",
  foreground: "#E8E8F0",
  card: "#0A0A0F",
  border: "#232330",
  muted: "#8B8B9E",
  "muted-foreground": "#6E6E84",
  dim: "#3C3C50",

  // Accent — cool indigo (primary) + cyan highlight
  accent: "#818CF8",
  "accent-dim": "#6366F1",

  // Status colors (cool-shifted)
  success: "#34D399",
  warning: "#FBBF24",
  error: "#FB7185",
  info: "#38BDF8",

  // Semantic aliases
  text: "#E8E8F0",
  "text-muted": "#8B8B9E",
  panel: "#0A0A0F",
  divider: "#232330",
  highlight: "#22D3EE",

  /** Dialog / overlay dim only — not a surface color */
  backdrop: "#000000",
} as const;

export type ColorKey = keyof typeof Colors;

/**
 * Cool spectrum for animated brackets (cyan → indigo → violet → magenta → back).
 * Used by TUI chrome (`CoolBrackets`) similar to Grok Build accent motion.
 */
export const CoolBracketPalette = [
  "#22D3EE", // cyan
  "#38BDF8", // sky
  "#60A5FA", // blue
  "#818CF8", // indigo
  "#A78BFA", // violet
  "#C084FC", // purple
  "#E879F9", // fuchsia
  "#A78BFA", // violet (ease back)
  "#818CF8", // indigo
  "#38BDF8", // sky
] as const;

export type CoolBracketColor = (typeof CoolBracketPalette)[number];

/** Connection pill colors (status bar). */
export const ConnectionStatusColor = {
  connected: Colors.success,
  polling: Colors.highlight,
  reconnecting: Colors.warning,
  offline: Colors.error,
} as const;

export type ConnectionStatusKey = keyof typeof ConnectionStatusColor;

/** Worker / service health colors. */
export const WorkerStatusColor = {
  operational: Colors.success,
  degraded: Colors.warning,
  down: Colors.error,
} as const;

export type WorkerStatusKey = keyof typeof WorkerStatusColor;

/** Log stream level colors. `debug` uses muted (readable), not dim. */
export const LogLevelColor = {
  error: Colors.error,
  warn: Colors.warning,
  info: Colors.foreground,
  debug: Colors.muted,
} as const;

export type LogLevelColorKey = keyof typeof LogLevelColor;

/** Alert severity colors. */
export const AlertSeverityColor = {
  info: Colors.info,
  warning: Colors.warning,
  error: Colors.error,
  critical: Colors.error,
} as const;

export type AlertSeverityColorKey = keyof typeof AlertSeverityColor;
