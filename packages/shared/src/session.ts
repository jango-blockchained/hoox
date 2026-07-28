/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session persistence — saves/restores TUI state to $HOME/.hoox/.tui-state/session.json.
 *
 * On destroy (app exit): serializes { activeView, sidebarExpanded, windowSize,
 * lastData } so the user returns to the same state on next launch.
 *
 * On startup: restores previous activeView and sidebarExpanded state.
 * Window size and lastData are saved for reference but re-detected/fetched fresh.
 *
 * Uses the shared getHooxHome() utility for cross-OS home directory resolution,
 * and stores session data in the .tui-state subdirectory. Falls back to
 * current working directory if $HOME is not available.
 *
 * Uses Bun's native file API for async read/write.
 */

import { getHooxHome } from "./path-utils";
import type { ViewId } from "./types";
import { z } from "zod";

// ─── Session shape ───────────────────────────────────────────────────────────

export interface SessionState {
  /** Last active view ID (e.g. "dashboard", "workers") */
  activeView: ViewId;
  /** Whether the sidebar was expanded */
  sidebarExpanded: boolean;
  /** Terminal window dimensions (cols × rows) */
  windowSize: { cols: number; rows: number };
  /** Timestamp of the last successful data fetch (ms) */
  lastData: number;
  /** ISO timestamp of when the session was saved */
  savedAt: string;
}

/**
 * Zod schema for the on-disk session.json shape.
 * All fields are optional — missing fields fall back to defaults.
 * activeView is validated against VALID_VIEW_IDS in the merge step.
 */
const SessionStateFileSchema = z
  .object({
    activeView: z.string().optional(),
    sidebarExpanded: z.boolean().optional(),
    windowSize: z
      .object({
        cols: z.number().int().positive(),
        rows: z.number().int().positive(),
      })
      .optional(),
    lastData: z.number().nonnegative().optional(),
    savedAt: z.string().optional(),
  })
  .strict();

// ─── File path ───────────────────────────────────────────────────────────────

const TUI_STATE_DIR = ".tui-state";
const SESSION_FILE = (() => {
  try {
    const hooxHome = getHooxHome();
    return `${hooxHome}/${TUI_STATE_DIR}/session.json`;
  } catch {
    // Fallback: use current working directory
    return `${process.cwd()}/${TUI_STATE_DIR}/session.json`;
  }
})();

// ─── Defaults (used when no saved session exists) ────────────────────────────

const DEFAULT_SESSION: SessionState = {
  activeView: "dashboard",
  sidebarExpanded: true,
  windowSize: { cols: 80, rows: 24 },
  lastData: 0,
  savedAt: new Date().toISOString(),
};

// ─── Save ────────────────────────────────────────────────────────────────────

/**
 * Persist the current UI state to $HOME/.hoox/.tui-state/session.json.
 * Call this on app destroy / clean shutdown.
 *
 * The $HOME/.hoox/.tui-state directory is created automatically by
 * Bun.write if needed (Bun creates parent directories).
 */
export async function saveSession(
  activeView: ViewId,
  sidebarExpanded: boolean,
  windowSize: { cols: number; rows: number },
  lastData: number
): Promise<void> {
  try {
    const session: SessionState = {
      activeView,
      sidebarExpanded,
      windowSize,
      lastData,
      savedAt: new Date().toISOString(),
    };
    await Bun.write(SESSION_FILE, JSON.stringify(session, null, 2));
  } catch (error) {
    // Session save failures are non-fatal — log and continue
    // (write failures may occur if ~/.hoox doesn't exist or is unwritable)
    console.error(
      "[session] Failed to save session:",
      (error as Error).message
    );
  }
}

// ─── Restore ─────────────────────────────────────────────────────────────────

/**
 * Restore the previous session state from $HOME/.hoox/.tui-state/session.json.
 * Returns defaults if the file doesn't exist or can't be parsed.
 *
 * @returns The saved session state, or defaults
 */
export async function restoreSession(): Promise<SessionState> {
  try {
    const file = Bun.file(SESSION_FILE);
    const exists = await file.exists();
    if (!exists) return { ...DEFAULT_SESSION };

    const raw = await file.text();
    const result = SessionStateFileSchema.safeParse(JSON.parse(raw));
    const parsed = result.success ? result.data : {};

    // Validate and merge with defaults
    return {
      activeView: validateViewId(parsed.activeView)
        ? (parsed.activeView as ViewId)
        : DEFAULT_SESSION.activeView,
      sidebarExpanded:
        typeof parsed.sidebarExpanded === "boolean"
          ? parsed.sidebarExpanded
          : DEFAULT_SESSION.sidebarExpanded,
      windowSize: parsed.windowSize ?? DEFAULT_SESSION.windowSize,
      lastData:
        typeof parsed.lastData === "number"
          ? parsed.lastData
          : DEFAULT_SESSION.lastData,
      savedAt: parsed.savedAt ?? DEFAULT_SESSION.savedAt,
    };
  } catch {
    // Corrupt or unreadable session file — use defaults
    return { ...DEFAULT_SESSION };
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_VIEW_IDS = new Set<string>([
  "dashboard",
  "workers",
  "worker-detail",
  "trade-monitor",
  "logs-viewer",
  "service-manager",
  "config-editor",
  "setup-wizard",
  "settings",
]);

function validateViewId(id: unknown): id is ViewId {
  return typeof id === "string" && VALID_VIEW_IDS.has(id);
}
