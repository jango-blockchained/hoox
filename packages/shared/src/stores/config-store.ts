/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Config Store — User preferences persisted to ~/.hoox/config.json.
 * Follows TUI Pattern 2: Store Subscription with selectors.
 *
 * Middleware ordering (innermost first → outermost last):
 *   1. immer           (enables mutable-style updates)
 *   2. persist         (saves/restores from disk)
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import { chmodSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ViewId, LogFilter, NotificationPreferences } from "../types";
import { HOOX_CONFIG_FILE_MODE, HOOX_DIR_MODE } from "../config";

// ─── Custom Bun Filesystem Storage ───────────────────────────────────────────

/**
 * StateStorage adapter that persists to ~/.hoox/config.json using Bun's
 * native filesystem APIs. The `name` key is ignored — the file path is fixed.
 * Files are tightened to owner-only mode (may contain tokens / prefs).
 */
const bunConfigStorage: StateStorage = {
  getItem: async (_name: string): Promise<string | null> => {
    try {
      const file = Bun.file(join(homedir(), ".hoox", "config.json"));
      const exists = await file.exists();
      if (!exists) return null;
      return await file.text();
    } catch {
      return null;
    }
  },

  setItem: async (_name: string, value: string): Promise<void> => {
    const dir = join(homedir(), ".hoox");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: HOOX_DIR_MODE });
    }
    try {
      chmodSync(dir, HOOX_DIR_MODE);
    } catch {
      // ignore
    }
    const filePath = join(dir, "config.json");
    await Bun.write(filePath, value);
    try {
      chmodSync(filePath, HOOX_CONFIG_FILE_MODE);
    } catch {
      // ignore — platform may not support chmod
    }
  },

  removeItem: async (_name: string): Promise<void> => {
    // Config is never removed — only reset to defaults
  },
};

// ─── Default Shortcuts ───────────────────────────────────────────────────────

const DEFAULT_SHORTCUTS: Record<string, string> = {
  "command-palette": "Ctrl+P",
  "toggle-sidebar": "Ctrl+B",
  "force-refresh": "Ctrl+R",
  quit: "Ctrl+Q",
  "view-1": "Ctrl+1",
  "view-2": "Ctrl+2",
  "view-3": "Ctrl+3",
  "view-4": "Ctrl+4",
  "view-5": "Ctrl+5",
  "view-6": "Ctrl+6",
  "view-7": "Ctrl+7",
  "view-8": "Ctrl+8",
  "view-9": "Ctrl+9",
  "view-10": "Ctrl+0",
};

// ─── Default Log Filters ─────────────────────────────────────────────────────

const DEFAULT_LOG_FILTER: LogFilter = {
  levels: ["info", "warn", "error"],
  workers: [], // empty = all workers
  searchText: "",
};

// ─── Default Notifications ───────────────────────────────────────────────────

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  alerts: true,
  trades: false,
  debug: false,
  system: true,
};

// ─── State ───────────────────────────────────────────────────────────────────

export interface ConfigState {
  theme: "dark" | "light";
  refreshIntervalMs: number;
  defaultView: ViewId;
  activeExchanges: string[];
  keyboardShortcuts: Record<string, string>;
  logFilters: LogFilter;
  notifications: NotificationPreferences;
  soundEnabled: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface ConfigActions {
  /** Merge partial config — only provided fields are updated. */
  updateConfig: (partial: Partial<ConfigState>) => void;
  /** Reset all settings to factory defaults. */
  resetDefaults: () => void;
  /** Update a single keyboard shortcut. */
  setShortcut: (action: string, key: string) => void;
  /** Toggle a specific notification channel. */
  toggleNotification: (channel: keyof NotificationPreferences) => void;
}

// ─── Default State (fallback when no saved config) ───────────────────────────

const defaults: ConfigState = {
  theme: "dark",
  refreshIntervalMs: 500,
  defaultView: "dashboard",
  activeExchanges: [],
  keyboardShortcuts: { ...DEFAULT_SHORTCUTS },
  logFilters: { ...DEFAULT_LOG_FILTER },
  notifications: { ...DEFAULT_NOTIFICATIONS },
  soundEnabled: false,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useConfigStore = create<ConfigState & ConfigActions>()(
  persist(
    immer((set) => ({
      ...defaults,

      updateConfig: (partial) =>
        set((state) => {
          // Merge each key individually so immer tracks mutations correctly
          if (partial.theme !== undefined) state.theme = partial.theme;
          if (partial.refreshIntervalMs !== undefined)
            state.refreshIntervalMs = partial.refreshIntervalMs;
          if (partial.defaultView !== undefined)
            state.defaultView = partial.defaultView;
          if (partial.activeExchanges !== undefined)
            state.activeExchanges = partial.activeExchanges;
          if (partial.keyboardShortcuts !== undefined)
            state.keyboardShortcuts = partial.keyboardShortcuts;
          if (partial.logFilters !== undefined)
            state.logFilters = partial.logFilters;
          if (partial.notifications !== undefined)
            state.notifications = partial.notifications;
          if (partial.soundEnabled !== undefined)
            state.soundEnabled = partial.soundEnabled;
        }),

      resetDefaults: () =>
        set((state) => {
          Object.assign(state, defaults);
        }),

      setShortcut: (action, key) =>
        set((state) => {
          state.keyboardShortcuts[action] = key;
        }),

      toggleNotification: (channel) =>
        set((state) => {
          state.notifications[channel] = !state.notifications[channel];
        }),
    })),
    {
      name: "hoox-config",
      storage: createJSONStorage(() => bunConfigStorage),
      // Only persist these fields (exclude derived/computed if any added later)
      partialize: (state) => ({
        theme: state.theme,
        refreshIntervalMs: state.refreshIntervalMs,
        defaultView: state.defaultView,
        activeExchanges: state.activeExchanges,
        keyboardShortcuts: state.keyboardShortcuts,
        logFilters: state.logFilters,
        notifications: state.notifications,
        soundEnabled: state.soundEnabled,
      }),
      // Restore defaults for any missing keys from older schema versions
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<ConfigState>),
      }),
    }
  )
);
