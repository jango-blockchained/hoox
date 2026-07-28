/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * UI Store Tests — Navigation, sidebar, modals, command palette.
 *
 * Tests Zustand store actions in isolation (no rendering).
 * Uses Bun test runner.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { useUIStore } from "@jango-blockchained/hoox-shared/stores/ui-store";
import type { ViewId, ModalState } from "@jango-blockchained/hoox-shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Reset store to initial state before each test */
function resetStore() {
  useUIStore.setState({
    activeView: "dashboard",
    sidebarExpanded: true,
    modal: null,
    commandPaletteOpen: false,
    previousView: null,
  });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("useUIStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // ── setView ──────────────────────────────────────────────────────────────

  describe("setView", () => {
    it("sets the active view", () => {
      useUIStore.getState().setView("workers");
      expect(useUIStore.getState().activeView).toBe("workers");
    });

    it("accepts all valid view IDs", () => {
      const views: ViewId[] = [
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
      for (const view of views) {
        useUIStore.getState().setView(view);
        expect(useUIStore.getState().activeView).toBe(view);
      }
    });

    it("tracks previous view when navigating to a different view", () => {
      useUIStore.getState().setView("workers");
      expect(useUIStore.getState().previousView).toBe("dashboard");
    });

    it("does not overwrite previousView when setting same view", () => {
      useUIStore.getState().setView("dashboard"); // already on dashboard
      expect(useUIStore.getState().previousView).toBeNull();
    });

    it("closes command palette when switching views", () => {
      useUIStore.getState().openPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);

      useUIStore.getState().setView("settings");
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("preserves previousView through multiple navigations", () => {
      useUIStore.getState().setView("workers");
      useUIStore.getState().setView("trade-monitor");
      expect(useUIStore.getState().previousView).toBe("workers");
      expect(useUIStore.getState().activeView).toBe("trade-monitor");
    });
  });

  // ── toggleSidebar ─────────────────────────────────────────────────────────

  describe("toggleSidebar", () => {
    it("toggles sidebar from expanded to collapsed", () => {
      expect(useUIStore.getState().sidebarExpanded).toBe(true);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarExpanded).toBe(false);
    });

    it("toggles sidebar from collapsed to expanded", () => {
      useUIStore.getState().toggleSidebar(); // collapse
      useUIStore.getState().toggleSidebar(); // expand
      expect(useUIStore.getState().sidebarExpanded).toBe(true);
    });

    it("handles multiple toggles correctly", () => {
      for (let i = 0; i < 5; i++) {
        useUIStore.getState().toggleSidebar();
      }
      expect(useUIStore.getState().sidebarExpanded).toBe(false); // 5 toggles from true = false
    });

    it("does not affect other UI state", () => {
      const before = { ...useUIStore.getState() };
      useUIStore.getState().toggleSidebar();
      const after = useUIStore.getState();
      expect(after.activeView).toBe(before.activeView);
      expect(after.commandPaletteOpen).toBe(before.commandPaletteOpen);
      expect(after.modal).toBe(before.modal);
    });
  });

  // ── openPalette / closePalette ────────────────────────────────────────────

  describe("command palette", () => {
    it("opens the command palette", () => {
      useUIStore.getState().openPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    });

    it("closes the command palette", () => {
      useUIStore.getState().openPalette();
      useUIStore.getState().closePalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("closePalette is idempotent when already closed", () => {
      useUIStore.getState().closePalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("openPalette is idempotent when already open", () => {
      useUIStore.getState().openPalette();
      useUIStore.getState().openPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    });

    it("palette state is independent of sidebar state", () => {
      useUIStore.getState().openPalette();
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
      expect(useUIStore.getState().sidebarExpanded).toBe(false);
    });
  });

  // ── showModal / dismissModal ──────────────────────────────────────────────

  describe("modal lifecycle", () => {
    it("sets modal state when showing a modal", () => {
      const modal: ModalState = {
        type: "confirm",
        title: "Delete Worker",
        message: "Are you sure?",
      };
      useUIStore.getState().showModal(modal);
      expect(useUIStore.getState().modal).toEqual(modal);
    });

    it("dismisses modal by setting it to null", () => {
      const modal: ModalState = {
        type: "alert",
        title: "Error",
        message: "Something went wrong",
      };
      useUIStore.getState().showModal(modal);
      useUIStore.getState().dismissModal();
      expect(useUIStore.getState().modal).toBeNull();
    });

    it("dismissModal is idempotent when no modal is shown", () => {
      useUIStore.getState().dismissModal();
      expect(useUIStore.getState().modal).toBeNull();
    });

    it("shows alert type modals", () => {
      const modal: ModalState = {
        type: "alert",
        title: "Warning",
        message: "Disk space low",
      };
      useUIStore.getState().showModal(modal);
      expect(useUIStore.getState().modal?.type).toBe("alert");
    });

    it("shows prompt type modals", () => {
      const modal: ModalState = {
        type: "prompt",
        title: "Rename",
        message: "Enter new name",
      };
      useUIStore.getState().showModal(modal);
      expect(useUIStore.getState().modal?.type).toBe("prompt");
    });

    it("shows custom type modals with data", () => {
      const modal: ModalState = {
        type: "custom",
        title: "Advanced",
        message: "Custom dialog",
        data: { key: "value" },
      };
      useUIStore.getState().showModal(modal);
      expect(useUIStore.getState().modal?.data).toEqual({ key: "value" });
    });

    it("replaces existing modal when showing a new one", () => {
      useUIStore.getState().showModal({ type: "alert", title: "First" });
      useUIStore.getState().showModal({ type: "confirm", title: "Second" });
      expect(useUIStore.getState().modal?.title).toBe("Second");
    });
  });

  // ── goBack ────────────────────────────────────────────────────────────────

  describe("goBack", () => {
    it("navigates back to the previous view", () => {
      useUIStore.getState().setView("workers");
      useUIStore.getState().setView("trade-monitor");
      // Now on trade-monitor, previousView = workers

      useUIStore.getState().goBack();
      expect(useUIStore.getState().activeView).toBe("workers");
      expect(useUIStore.getState().previousView).toBeNull();
    });

    it("does nothing when there is no previous view", () => {
      expect(useUIStore.getState().previousView).toBeNull();
      useUIStore.getState().goBack();
      expect(useUIStore.getState().activeView).toBe("dashboard");
    });

    it("only goes back one level", () => {
      useUIStore.getState().setView("workers"); // prev = dashboard
      useUIStore.getState().setView("trade-monitor"); // prev = workers
      useUIStore.getState().setView("settings"); // prev = trade-monitor

      useUIStore.getState().goBack();
      expect(useUIStore.getState().activeView).toBe("trade-monitor");
    });

    it("clears previousView after going back", () => {
      useUIStore.getState().setView("settings");
      useUIStore.getState().goBack();
      useUIStore.getState().goBack();
      // Second goBack should be a no-op since previousView is null
      expect(useUIStore.getState().activeView).toBe("dashboard");
    });
  });

  // ── Initial State ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts on dashboard view", () => {
      resetStore();
      expect(useUIStore.getState().activeView).toBe("dashboard");
    });

    it("starts with sidebar expanded", () => {
      resetStore();
      expect(useUIStore.getState().sidebarExpanded).toBe(true);
    });

    it("starts with no modal", () => {
      resetStore();
      expect(useUIStore.getState().modal).toBeNull();
    });

    it("starts with command palette closed", () => {
      resetStore();
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("starts with no previous view", () => {
      resetStore();
      expect(useUIStore.getState().previousView).toBeNull();
    });
  });
});
