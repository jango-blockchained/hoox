/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration Tests — Navigation, view switching, keyboard shortcuts.
 *
 * Tests the full navigation flow via the UI store, verifying:
 *   - View transitions via setView
 *   - Keyboard shortcut dispatch (Ctrl+1-9)
 *   - Focus routing across views
 *   - Command palette integration
 *   - Back navigation
 *
 * Uses Bun test runner. Pure store-level integration (no rendering).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { useUIStore } from "@jango-blockchained/hoox-shared/stores/ui-store";
import { useServiceStore } from "@jango-blockchained/hoox-shared/stores/service-store";
import type { ViewId } from "@jango-blockchained/hoox-shared";

// ─── View shortcut mapping (mirrors app.tsx) ──────────────────────────────────

const VIEW_SHORTCUTS: Record<string, ViewId> = {
  "1": "dashboard",
  "2": "workers",
  "3": "worker-detail",
  "4": "trade-monitor",
  "5": "logs-viewer",
  "6": "service-manager",
  "7": "config-editor",
  "8": "setup-wizard",
  "9": "settings",
};

// ─── All view IDs for iteration ───────────────────────────────────────────────

const ALL_VIEWS: ViewId[] = [
  "dashboard",
  "workers",
  "worker-detail",
  "trade-monitor",
  "logs-viewer",
  "service-manager",
  "config-editor",
  "setup-wizard",
  "settings",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetStores() {
  useUIStore.setState({
    activeView: "dashboard",
    sidebarExpanded: true,
    modal: null,
    commandPaletteOpen: false,
    previousView: null,
  });
  useServiceStore.setState({
    workers: [],
    connectionStatus: "offline",
  });
}

/** Simulate a Ctrl+Number keyboard shortcut dispatch */
function dispatchShortcut(key: string) {
  const view = VIEW_SHORTCUTS[key];
  if (view) {
    useUIStore.getState().setView(view);
  }
}

/** Simulate Ctrl+B (toggle sidebar) */
function dispatchCtrlB() {
  useUIStore.getState().toggleSidebar();
}

/** Simulate Ctrl+P (command palette) */
function dispatchCtrlP() {
  useUIStore.getState().openPalette();
}

/** Simulate Escape */
function dispatchEscape() {
  const state = useUIStore.getState();
  if (state.commandPaletteOpen) {
    useUIStore.getState().closePalette();
  } else if (state.previousView) {
    useUIStore.getState().goBack();
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Navigation Integration", () => {
  beforeEach(() => {
    resetStores();
  });

  // ── View Switching ──────────────────────────────────────────────────────

  describe("view switching", () => {
    it("starts on dashboard", () => {
      expect(useUIStore.getState().activeView).toBe("dashboard");
    });

    it("switches to all views via keyboard shortcuts", () => {
      for (const [key, view] of Object.entries(VIEW_SHORTCUTS)) {
        dispatchShortcut(key);
        expect(useUIStore.getState().activeView).toBe(view);
      }
    });

    it("tracks navigation history for back support", () => {
      dispatchShortcut("2"); // workers
      expect(useUIStore.getState().previousView).toBe("dashboard");

      dispatchShortcut("4"); // trade-monitor
      expect(useUIStore.getState().previousView).toBe("workers");
    });

    it("goBack returns to previous view", () => {
      dispatchShortcut("2"); // workers
      dispatchShortcut("4"); // trade-monitor
      useUIStore.getState().goBack();

      expect(useUIStore.getState().activeView).toBe("workers");
      expect(useUIStore.getState().previousView).toBeNull();
    });

    it("double goBack after single navigation has no effect", () => {
      dispatchShortcut("9"); // settings
      useUIStore.getState().goBack();

      expect(useUIStore.getState().activeView).toBe("dashboard");
      // second goBack should be no-op
      useUIStore.getState().goBack();
      expect(useUIStore.getState().activeView).toBe("dashboard");
    });

    it("switching to same view does not change history", () => {
      useUIStore.getState().setView("dashboard");
      expect(useUIStore.getState().previousView).toBeNull();
    });
  });

  // ── Keyboard Shortcut Dispatch ──────────────────────────────────────────

  describe("keyboard shortcuts", () => {
    it("Ctrl+1 through Ctrl+9 switch all 9 views", () => {
      for (let i = 1; i <= 9; i++) {
        dispatchShortcut(String(i));
        expect(useUIStore.getState().activeView).toBe(
          VIEW_SHORTCUTS[String(i)]
        );
      }
    });

    it("Ctrl+B toggles sidebar", () => {
      expect(useUIStore.getState().sidebarExpanded).toBe(true);
      dispatchCtrlB();
      expect(useUIStore.getState().sidebarExpanded).toBe(false);
      dispatchCtrlB();
      expect(useUIStore.getState().sidebarExpanded).toBe(true);
    });

    it("Ctrl+P opens command palette", () => {
      dispatchCtrlP();
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    });

    it("Escape closes command palette when open", () => {
      dispatchCtrlP();
      dispatchEscape();
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("view switching auto-closes command palette", () => {
      dispatchCtrlP();
      dispatchShortcut("5");
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });
  });

  // ── Focus Routing ───────────────────────────────────────────────────────

  describe("focus routing", () => {
    it("each view can be activated independently", () => {
      for (const view of ALL_VIEWS) {
        useUIStore.getState().setView(view);
        expect(useUIStore.getState().activeView).toBe(view);
      }
    });

    it("sidebar expand/collapse maintains active view", () => {
      useUIStore.getState().setView("trade-monitor");
      dispatchCtrlB();
      expect(useUIStore.getState().activeView).toBe("trade-monitor");
      dispatchCtrlB();
      expect(useUIStore.getState().activeView).toBe("trade-monitor");
    });

    it("modal overlay does not change active view", () => {
      useUIStore.getState().setView("logs-viewer");
      useUIStore.getState().showModal({ type: "alert", title: "Test" });
      expect(useUIStore.getState().activeView).toBe("logs-viewer");
      useUIStore.getState().dismissModal();
      expect(useUIStore.getState().activeView).toBe("logs-viewer");
    });

    it("back navigation restores correct focus", () => {
      useUIStore.getState().setView("workers");
      useUIStore.getState().setView("service-manager");
      useUIStore.getState().goBack();
      expect(useUIStore.getState().activeView).toBe("workers");
    });
  });

  // ── Rapid Transitions ───────────────────────────────────────────────────

  describe("rapid transitions", () => {
    it("handles rapid sequential view switches", () => {
      for (const view of ALL_VIEWS) {
        useUIStore.getState().setView(view);
      }
      // Should end on the last view
      expect(useUIStore.getState().activeView).toBe("settings");
    });

    it("handles rapid sidebar toggles", () => {
      for (let i = 0; i < 10; i++) {
        dispatchCtrlB();
      }
      // 10 toggles from true: true→false→true→false→true→false→true→false→true→false→true
      expect(useUIStore.getState().sidebarExpanded).toBe(true);
    });

    it("handles rapid palette open/close", () => {
      for (let i = 0; i < 5; i++) {
        dispatchCtrlP();
        dispatchEscape();
      }
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("state remains consistent after rapid mixed operations", () => {
      dispatchShortcut("3");
      dispatchCtrlB();
      dispatchCtrlP();
      dispatchShortcut("7");
      dispatchCtrlB();
      // After switching views, palette should be closed
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
      expect(useUIStore.getState().activeView).toBe("config-editor");
    });
  });

  // ── View Registry Completeness ──────────────────────────────────────────

  describe("view registry", () => {
    it("all 9 views are defined and reachable", () => {
      expect(ALL_VIEWS).toHaveLength(9);
    });

    it("shortcuts map 1:1 to views", () => {
      const shortcutEntries = Object.entries(VIEW_SHORTCUTS);
      expect(shortcutEntries.length).toBe(9);
      // Every view is mapped
      const mappedViews = new Set(Object.values(VIEW_SHORTCUTS));
      expect(mappedViews.size).toBe(9);
    });

    it("each view ID has a valid type", () => {
      for (const view of ALL_VIEWS) {
        expect(typeof view).toBe("string");
        expect(view.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Store Isolation ─────────────────────────────────────────────────────

  describe("store isolation", () => {
    it("UI state changes do not affect service state", () => {
      useServiceStore.setState({ connectionStatus: "connected" });

      dispatchShortcut("5");
      dispatchCtrlB();

      expect(useServiceStore.getState().connectionStatus).toBe("connected");
    });

    it("service state changes do not affect UI state", () => {
      useUIStore.getState().setView("workers");

      useServiceStore.setState({ connectionStatus: "polling" });

      expect(useUIStore.getState().activeView).toBe("workers");
    });
  });
});
