/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * KeybindingHint — renders a keyboard shortcut label for the status bar
 * and command palette results.
 *
 * Format: " keys  label" — keys in dim/muted, label in foreground.
 * Used as a compact shortcut indicator throughout the TUI.
 */
import { Colors } from "@jango-blockchained/hoox-shared";

// ── Types ──────────────────────────────────────────────────────────────────

export interface KeybindingHintProps {
  /** The key combination (e.g. "Ctrl+P", "^P", "↑↓") */
  keys: string;
  /** The action description (e.g. "Palette", "Navigate") */
  label: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function KeybindingHint({ keys, label }: KeybindingHintProps) {
  return (
    <box flexDirection="row" gap={0}>
      <text dim fg={Colors.muted}>
        {keys}
      </text>
      <text> </text>
      <text fg={Colors.foreground}>{label}</text>
    </box>
  );
}
