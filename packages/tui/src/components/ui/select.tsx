/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * SelectModal — a thin wrapper combining @opentui-ui/dialog modal behavior
 * with keyboard-navigable option selection, styled with Hoox color tokens.
 *
 * Keyboard navigation:
 *   - Up/Down (or j/k): move selection
 *   - Enter: confirm selection
 *   - Escape: dismiss
 *
 * All colors use Colors tokens from @hoox-sh/hoox-shared (no hardcoded hex).
 */
import { useState } from "react";
import {
  type DialogId,
  type PromptContext,
  useDialogKeyboard,
} from "@opentui-ui/dialog/react";
import { Colors } from "@hoox-sh/hoox-shared";

// ── Types ──────────────────────────────────────────────────────────────────

/** A single selectable option */
export interface SelectOption {
  /** Unique key for the option */
  key: string;
  /** Display label shown in the list */
  label: string;
  /** Optional description rendered dimmed below or beside the label */
  description?: string;
}

/** Options for the SelectModal */
export interface SelectModalOptions {
  /** Title displayed at the top of the modal (bold, accent-colored) */
  title: string;
  /** Array of selectable options */
  options: SelectOption[];
  /** Whether clicking outside the modal dismisses it (default: true) */
  closeOnClickOutside?: boolean;
}

/** Dialog handle — the subset of useDialog() needed by SelectModal */
export interface SelectDialogHandle {
  prompt<T>(options: {
    content: (ctx: PromptContext<T>) => unknown;
    fallback?: T;
    closeOnClickOutside?: boolean;
  }): Promise<T | undefined>;
}

// ── Internal: keyboard-navigable option list ───────────────────────────────

/** Props for the selectable option list rendered inside the dialog */
interface SelectListProps {
  options: SelectOption[];
  accentColor: string;
  foregroundColor: string;
  mutedColor: string;
  highlightColor: string;
  resolve: (value: string) => void;
  dismiss: () => void;
  dialogId: DialogId;
}

/**
 * Internal component that renders a keyboard-navigable option list.
 * Uses useDialogKeyboard scoped to the dialog so that only the topmost
 * dialog receives keyboard events.
 */
function SelectList({
  options,
  accentColor,
  foregroundColor,
  mutedColor,
  highlightColor,
  resolve,
  dismiss,
  dialogId,
}: SelectListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useDialogKeyboard((key) => {
    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    }
    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    }
    if (key.name === "return") {
      const selected = options[selectedIndex];
      if (selected) resolve(selected.key);
    }
    if (key.name === "escape") {
      dismiss();
    }
  }, dialogId);

  return (
    <box flexDirection="column" gap={0}>
      {options.map((opt, idx) => (
        <box flexDirection="row" gap={2} paddingLeft={1} paddingRight={1}>
          {/* Selection indicator */}
          <text fg={idx === selectedIndex ? accentColor : mutedColor}>
            {idx === selectedIndex ? "▶" : " "}
          </text>
          {/* Option label */}
          <text
            fg={idx === selectedIndex ? foregroundColor : mutedColor}
            bg={idx === selectedIndex ? highlightColor : undefined}
            onMouseUp={() => resolve(opt.key)}
          >
            {opt.label}
          </text>
          {/* Optional description */}
          {opt.description && (
            <text dim fg={mutedColor}>
              — {opt.description}
            </text>
          )}
        </box>
      ))}
    </box>
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Show a modal select dialog with keyboard navigation.
 *
 * Returns the selected option's `key`, or `undefined` if dismissed
 * (via Escape, clicking outside, or pressing Cancel).
 *
 * Keyboard controls:
 *   - Up/Down or j/k: move selection highlight
 *   - Enter: confirm current selection
 *   - Escape: dismiss
 *
 * @example
 * const chosen = await showSelectModal(dialog, {
 *   title: "Select Worker",
 *   options: [
 *     { key: "worker-a", label: "Alpha Worker", description: "US-East" },
 *     { key: "worker-b", label: "Beta Worker",  description: "EU-West" },
 *   ],
 * })
 */
export async function showSelectModal(
  dialog: SelectDialogHandle,
  opts: SelectModalOptions
): Promise<string | undefined> {
  const { title, options, closeOnClickOutside = true } = opts;

  return dialog.prompt<string>({
    content: (ctx: PromptContext<string>) => (
      <box flexDirection="column" padding={1} gap={1}>
        {/* Header */}
        <text fg={Colors.accent}>
          <b>{title}</b>
        </text>
        <text dim fg={Colors.muted}>
          Use ↑↓ to navigate, Enter to select, Esc to cancel
        </text>

        {/* Divider */}
        <box height={1} />

        {/* Selectable list */}
        <SelectList
          options={options}
          accentColor={Colors.accent}
          foregroundColor={Colors.foreground}
          mutedColor={Colors.muted}
          highlightColor={Colors.card}
          resolve={ctx.resolve}
          dismiss={ctx.dismiss}
          dialogId={ctx.dialogId}
        />

        {/* Footer actions */}
        <box flexDirection="row" justifyContent="flex-end" paddingTop={1}>
          <text fg={Colors.muted} onMouseUp={ctx.dismiss}>
            {"  Cancel  "}
          </text>
        </box>
      </box>
    ),
    fallback: undefined,
    closeOnClickOutside,
  });
}
