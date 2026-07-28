/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

const STORAGE_KEY = "hoox_setup_completed";

/**
 * Check whether the user has completed (or skipped) initial setup.
 * Reads from `localStorage`; returns `false` if unavailable.
 */
export function isSetupCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Persist a "completed" flag so the next dashboard visit doesn't re-trigger
 * the wizard. Safe to call server-side (no-op).
 */
export function markSetupCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Ignore quota / disabled storage errors
  }
}

/**
 * Clear the "completed" flag so the wizard re-appears next time.
 * Useful for the "Restart setup" button.
 */
export function resetSetupProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export const SETUP_STORAGE_KEY = STORAGE_KEY;
