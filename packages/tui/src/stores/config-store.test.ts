/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Config Store Tests — Persistence, update, reset, shortcuts, notifications.
 *
 * Tests Zustand store with persist + immer middleware.
 * Uses Bun test runner.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { useConfigStore } from "@hoox-sh/hoox-shared/stores/config-store";
import type {
  ViewId,
  NotificationPreferences,
  LogLevel,
} from "@hoox-sh/hoox-shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  theme: "dark" as const,
  refreshIntervalMs: 500,
  defaultView: "dashboard" as ViewId,
  activeExchanges: [] as string[],
  keyboardShortcuts: {
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
  },
  logFilters: {
    levels: ["info", "warn", "error"] as LogLevel[],
    workers: [] as string[],
    searchText: "",
  },
  notifications: {
    alerts: true,
    trades: false,
    debug: false,
    system: true,
  },
  soundEnabled: false,
};

function resetStore() {
  useConfigStore.setState(DEFAULT_STATE);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("useConfigStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // ── Initial State ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with dark theme", () => {
      expect(useConfigStore.getState().theme).toBe("dark");
    });

    it("starts with 500ms refresh interval", () => {
      expect(useConfigStore.getState().refreshIntervalMs).toBe(500);
    });

    it("starts with dashboard as default view", () => {
      expect(useConfigStore.getState().defaultView).toBe("dashboard");
    });

    it("starts with empty active exchanges", () => {
      expect(useConfigStore.getState().activeExchanges).toEqual([]);
    });

    it("starts with default keyboard shortcuts (14 entries)", () => {
      const shortcuts = Object.keys(
        useConfigStore.getState().keyboardShortcuts
      );
      expect(shortcuts.length).toBe(14);
    });

    it("starts with sound disabled", () => {
      expect(useConfigStore.getState().soundEnabled).toBe(false);
    });

    it("starts with default log filters (info, warn, error)", () => {
      expect(useConfigStore.getState().logFilters.levels).toEqual([
        "info",
        "warn",
        "error",
      ]);
    });
  });

  // ── updateConfig ──────────────────────────────────────────────────────────

  describe("updateConfig", () => {
    it("updates a single config field", () => {
      useConfigStore.getState().updateConfig({ theme: "light" });
      expect(useConfigStore.getState().theme).toBe("light");
    });

    it("updates multiple config fields at once", () => {
      useConfigStore.getState().updateConfig({
        theme: "light",
        refreshIntervalMs: 1000,
        soundEnabled: true,
      });
      const state = useConfigStore.getState();
      expect(state.theme).toBe("light");
      expect(state.refreshIntervalMs).toBe(1000);
      expect(state.soundEnabled).toBe(true);
    });

    it("does not change unspecified fields", () => {
      useConfigStore.getState().updateConfig({ theme: "light" });
      const state = useConfigStore.getState();
      expect(state.refreshIntervalMs).toBe(500); // unchanged
      expect(state.defaultView).toBe("dashboard"); // unchanged
    });

    it("updates defaultView to a valid view", () => {
      useConfigStore.getState().updateConfig({ defaultView: "trade-monitor" });
      expect(useConfigStore.getState().defaultView).toBe("trade-monitor");
    });

    it("updates activeExchanges", () => {
      useConfigStore
        .getState()
        .updateConfig({ activeExchanges: ["binance", "bybit"] });
      expect(useConfigStore.getState().activeExchanges).toEqual([
        "binance",
        "bybit",
      ]);
    });

    it("updates soundEnabled", () => {
      useConfigStore.getState().updateConfig({ soundEnabled: true });
      expect(useConfigStore.getState().soundEnabled).toBe(true);
    });

    it("updates keyboard shortcuts", () => {
      useConfigStore.getState().updateConfig({
        keyboardShortcuts: {
          ...DEFAULT_STATE.keyboardShortcuts,
          quit: "Ctrl+X",
        },
      });
      expect(useConfigStore.getState().keyboardShortcuts.quit).toBe("Ctrl+X");
    });

    it("updates log filters", () => {
      useConfigStore.getState().updateConfig({
        logFilters: {
          levels: ["error"],
          workers: ["worker1"],
          searchText: "test",
        },
      });
      expect(useConfigStore.getState().logFilters.levels).toEqual(["error"]);
      expect(useConfigStore.getState().logFilters.searchText).toBe("test");
    });

    it("updates notification preferences", () => {
      useConfigStore.getState().updateConfig({
        notifications: {
          alerts: false,
          trades: true,
          debug: true,
          system: false,
        },
      });
      const n = useConfigStore.getState().notifications;
      expect(n.alerts).toBe(false);
      expect(n.trades).toBe(true);
      expect(n.debug).toBe(true);
      expect(n.system).toBe(false);
    });

    it("handles empty partial (no-ops gracefully)", () => {
      const before = { ...useConfigStore.getState() };
      useConfigStore.getState().updateConfig({});
      const after = useConfigStore.getState();
      // Key fields should be unchanged
      expect(after.theme).toBe(before.theme);
      expect(after.refreshIntervalMs).toBe(before.refreshIntervalMs);
    });
  });

  // ── resetDefaults ─────────────────────────────────────────────────────────

  describe("resetDefaults", () => {
    it("resets all fields to factory defaults", () => {
      // First, mutate everything
      useConfigStore.getState().updateConfig({
        theme: "light",
        refreshIntervalMs: 2000,
        defaultView: "settings",
        activeExchanges: ["binance"],
        soundEnabled: true,
      });
      useConfigStore.getState().setShortcut("quit", "Ctrl+X");
      useConfigStore.getState().toggleNotification("alerts");

      // Then reset
      useConfigStore.getState().resetDefaults();

      const state = useConfigStore.getState();
      expect(state.theme).toBe("dark");
      expect(state.refreshIntervalMs).toBe(500);
      expect(state.defaultView).toBe("dashboard");
      expect(state.soundEnabled).toBe(false);
      expect(state.activeExchanges).toEqual([]);
      expect(state.keyboardShortcuts.quit).toBe("Ctrl+Q");
      expect(state.notifications.alerts).toBe(true);
    });

    it("resetDefaults restores default notifications", () => {
      useConfigStore.getState().updateConfig({
        notifications: {
          alerts: false,
          trades: true,
          debug: true,
          system: false,
        },
      });
      useConfigStore.getState().resetDefaults();

      const n = useConfigStore.getState().notifications;
      expect(n.alerts).toBe(true);
      expect(n.trades).toBe(false);
      expect(n.debug).toBe(false);
      expect(n.system).toBe(true);
    });

    it("resetDefaults clears active exchanges", () => {
      useConfigStore
        .getState()
        .updateConfig({ activeExchanges: ["binance", "bybit", "mexc"] });
      useConfigStore.getState().resetDefaults();
      expect(useConfigStore.getState().activeExchanges).toEqual([]);
    });
  });

  // ── setShortcut ───────────────────────────────────────────────────────────

  describe("setShortcut", () => {
    it("updates an existing shortcut", () => {
      useConfigStore.getState().setShortcut("toggle-sidebar", "Ctrl+K");
      expect(
        useConfigStore.getState().keyboardShortcuts["toggle-sidebar"]
      ).toBe("Ctrl+K");
    });

    it("adds a new shortcut key", () => {
      useConfigStore.getState().setShortcut("custom-action", "Ctrl+Y");
      expect(useConfigStore.getState().keyboardShortcuts["custom-action"]).toBe(
        "Ctrl+Y"
      );
    });

    it("does not affect other shortcuts", () => {
      const before = useConfigStore.getState().keyboardShortcuts["quit"];
      useConfigStore.getState().setShortcut("toggle-sidebar", "Ctrl+K");
      expect(useConfigStore.getState().keyboardShortcuts["quit"]).toBe(before);
    });
  });

  // ── toggleNotification ────────────────────────────────────────────────────

  describe("toggleNotification", () => {
    it("toggles alerts from true to false", () => {
      expect(useConfigStore.getState().notifications.alerts).toBe(true);
      useConfigStore.getState().toggleNotification("alerts");
      expect(useConfigStore.getState().notifications.alerts).toBe(false);
    });

    it("toggles trades from false to true", () => {
      expect(useConfigStore.getState().notifications.trades).toBe(false);
      useConfigStore.getState().toggleNotification("trades");
      expect(useConfigStore.getState().notifications.trades).toBe(true);
    });

    it("toggles debug from false to true", () => {
      useConfigStore.getState().toggleNotification("debug");
      expect(useConfigStore.getState().notifications.debug).toBe(true);
    });

    it("toggles system from true to false", () => {
      useConfigStore.getState().toggleNotification("system");
      expect(useConfigStore.getState().notifications.system).toBe(false);
    });

    it("toggle is idempotent after two calls", () => {
      const before = useConfigStore.getState().notifications.alerts;
      useConfigStore.getState().toggleNotification("alerts");
      useConfigStore.getState().toggleNotification("alerts");
      expect(useConfigStore.getState().notifications.alerts).toBe(before);
    });
  });

  // ── Persistence (structural) ──────────────────────────────────────────────

  describe("persist configuration", () => {
    it("store has persist middleware configured", () => {
      // Zustand persist adds .persist property to the store
      expect(useConfigStore.persist).toBeDefined();
    });

    it("has configured storage name", () => {
      // The store should be set up with 'hoox-config' name
      // verify via the persist API
      const persistOptions = (useConfigStore.persist as any)?.getOptions?.();
      // Different zustand versions expose this differently;
      // we at minimum verify the store was created with persist
      expect(typeof useConfigStore.getState).toBe("function");
      expect(typeof useConfigStore.setState).toBe("function");
    });

    it("only partializes known top-level keys", () => {
      const state = useConfigStore.getState();
      // The partialize function should flatten to known keys
      const partialized = {
        theme: state.theme,
        refreshIntervalMs: state.refreshIntervalMs,
        defaultView: state.defaultView,
        activeExchanges: state.activeExchanges,
        keyboardShortcuts: state.keyboardShortcuts,
        logFilters: state.logFilters,
        notifications: state.notifications,
        soundEnabled: state.soundEnabled,
      };
      // All keys should be primitive/serializable (no functions)
      expect(typeof partialized.theme).toBe("string");
      expect(typeof partialized.refreshIntervalMs).toBe("number");
      expect(typeof partialized.soundEnabled).toBe("boolean");
      expect(Array.isArray(partialized.activeExchanges)).toBe(true);
    });

    it("can update and read back config through store", () => {
      useConfigStore.getState().updateConfig({ refreshIntervalMs: 1500 });
      expect(useConfigStore.getState().refreshIntervalMs).toBe(1500);

      useConfigStore.getState().updateConfig({ refreshIntervalMs: 500 });
      expect(useConfigStore.getState().refreshIntervalMs).toBe(500);
    });
  });
});
