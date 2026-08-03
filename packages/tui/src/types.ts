/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TUI-specific types — Navigation, modals, keyboard shortcuts.
 */

import type { CliErrorType, CliErrorDetails } from "@hoox-sh/hoox-shared";

// Re-export shared CLI error types for convenience so consumers can
// import everything from the tui/types module.
export type { CliErrorType, CliErrorDetails };

/** All primary views registered with the TUI. */
export const ALL_VIEWS = [
  "dashboard",
  "workers",
  "worker-detail",
  "trade-monitor",
  "logs-viewer",
  "service-manager",
  "config-editor",
  "setup-wizard",
  "settings",
  "queue-depth",
  "kv-viewer",
  "secrets-viewer",
  "db-query",
  "ai-chat",
  "edge-topology",
  "worker-settings",
] as const;

export type ViewId = (typeof ALL_VIEWS)[number];

export const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: "DASHBOARD",
  workers: "WORKERS",
  "worker-detail": "WORKER DETAIL",
  "trade-monitor": "TRADES",
  "logs-viewer": "LOGS",
  "service-manager": "SERVICES",
  "config-editor": "CONFIG",
  "setup-wizard": "SETUP",
  settings: "SETTINGS",
  "queue-depth": "QUEUES",
  "kv-viewer": "KV",
  "secrets-viewer": "SECRETS",
  "db-query": "DB QUERY",
  "ai-chat": "AI CHAT",
  "edge-topology": "TOPOLOGY",
  "worker-settings": "W SETTINGS",
};

export const VIEW_ORDER: ViewId[] = [
  "dashboard",
  "workers",
  "worker-detail",
  "trade-monitor",
  "logs-viewer",
  "service-manager",
  "config-editor",
  "setup-wizard",
  "settings",
  "queue-depth",
  "kv-viewer",
  "secrets-viewer",
  "db-query",
  "ai-chat",
  "edge-topology",
  "worker-settings",
];

export function viewIndex(view: ViewId): number {
  return VIEW_ORDER.indexOf(view);
}

export type ModalType = "confirm" | "choice" | "loading" | "prompt";

export interface ModalState {
  type: ModalType;
  id: string;
  title?: string;
  message?: string;
  resolve?: (value: unknown) => void;
}

export interface ShortcutMap {
  [keys: string]: string;
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  "Ctrl+1": "DASHBOARD",
  "Ctrl+2": "WORKERS",
  "Ctrl+3": "WORKER DETAIL",
  "Ctrl+4": "TRADES",
  "Ctrl+5": "LOGS",
  "Ctrl+6": "SERVICES",
  "Ctrl+7": "CONFIG",
  "Ctrl+8": "SETUP",
  "Ctrl+9": "SETTINGS",
  "Ctrl+P": "COMMAND PALETTE",
  "Ctrl+B": "TOGGLE SIDEBAR",
  "Ctrl+R": "REFRESH DATA",
  "Ctrl+Q": "QUIT",
  Esc: "BACK / CLOSE",
  Tab: "NEXT FOCUS",
  "Shift+Tab": "PREVIOUS FOCUS",
  Space: "TOGGLE / PAUSE",
  "/": "SEARCH",
  Enter: "SELECT / CONFIRM",
};

// ─── CliBridge Types ─────────────────────────────────────────────

export interface CliResult<T = unknown> {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  data: T | null;
  duration: number;
  /**
   * The full command string that was executed, e.g. `"hoox check health"`.
   * Captured by `cli-bridge.exec()` so the status bar can show exactly
   * which command failed. Empty string when the binary itself was not found.
   */
  command: string;
  /**
   * Classification of the failure, or `null` on success.
   * Drives the icon and recovery hint shown in the expanded error panel.
   */
  errorType: CliErrorType | null;
}

export type CliCommandStatus = "idle" | "running" | "success" | "failure";

export interface CliCommandState {
  tag: string;
  description: string;
  status: CliCommandStatus;
  result: CliResult | null;
  startedAt: number | null;
}
