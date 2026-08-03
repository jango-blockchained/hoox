/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * UI Store — Navigation, sidebar, modals, command palette.
 * Follows TUI Pattern 2: Store Subscription with selectors.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ViewId, ModalState } from "../types";

// ─── State ───────────────────────────────────────────────────────────────────

export interface UIState {
  activeView: ViewId;
  sidebarExpanded: boolean;
  modal: ModalState | null;
  commandPaletteOpen: boolean;
  previousView: ViewId | null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface UIActions {
  setView: (view: ViewId) => void;
  toggleSidebar: () => void;
  openPalette: () => void;
  closePalette: () => void;
  showModal: (modal: ModalState) => void;
  dismissModal: () => void;
  goBack: () => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_VIEW: ViewId = "dashboard";

const initialState: UIState = {
  activeView: DEFAULT_VIEW,
  sidebarExpanded: true,
  modal: null,
  commandPaletteOpen: false,
  previousView: null,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState & UIActions>()(
  immer((set) => ({
    ...initialState,

    setView: (view) =>
      set((state) => {
        // Track previous view for back navigation, unless same view
        if (state.activeView !== view) {
          state.previousView = state.activeView;
        }
        state.activeView = view;
        // Close palette when navigating
        state.commandPaletteOpen = false;
      }),

    toggleSidebar: () =>
      set((state) => {
        state.sidebarExpanded = !state.sidebarExpanded;
      }),

    openPalette: () =>
      set((state) => {
        state.commandPaletteOpen = true;
      }),

    closePalette: () =>
      set((state) => {
        state.commandPaletteOpen = false;
      }),

    showModal: (modal) =>
      set((state) => {
        state.modal = modal;
      }),

    dismissModal: () =>
      set((state) => {
        state.modal = null;
      }),

    goBack: () =>
      set((state) => {
        if (state.previousView) {
          state.activeView = state.previousView;
          state.previousView = null;
        }
      }),
  }))
);
