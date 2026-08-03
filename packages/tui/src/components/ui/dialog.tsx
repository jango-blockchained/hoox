/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Thin wrappers around @opentui-ui/dialog/react with Hoox color tokens.
 * Provides ConfirmDialog, ChoiceDialog, and LoadingDialog helpers.
 *
 * All dialogs render centered with a dimmed backdrop (backdropOpacity 0.35)
 * and use Colors tokens from @hoox-sh/hoox-shared for consistent Hoox branding.
 */
import { useState } from "react";
import {
  type ChoiceContext,
  type ConfirmContext,
  type DialogId,
  useDialogKeyboard,
} from "@opentui-ui/dialog/react";
import { Colors } from "@hoox-sh/hoox-shared";

// ── Types ──────────────────────────────────────────────────────────────────

/** Options for confirm dialogs (Yes/No, Confirm/Cancel) */
export interface ConfirmDialogOptions {
  /** Dialog title (bold, accent-colored) */
  title: string;
  /** Explanatory message below the title */
  message: string;
  /** Label for the affirmative button (default: "Confirm") */
  confirmLabel?: string;
  /** Label for the dismiss button (default: "Cancel") */
  cancelLabel?: string;
  /** Whether clicking outside the dialog dismisses it (default: true) */
  closeOnClickOutside?: boolean;
}

/** A single choice item in a choice dialog */
export interface ChoiceOption<K extends string = string> {
  key: K;
  label: string;
  description?: string;
}

/** Options for choice dialogs */
export interface ChoiceDialogOptions<K extends string = string> {
  /** Dialog title */
  title: string;
  /** Array of selectable options */
  choices: ChoiceOption<K>[];
  /** Value returned when dialog is dismissed via ESC/backdrop (default: undefined) */
  fallback?: K;
  /** Whether clicking outside dismisses (default: true) */
  closeOnClickOutside?: boolean;
}

/** Dialog manager interface — subset of what useDialog() returns */
export interface DialogHandle {
  confirm(options: {
    content: (ctx: ConfirmContext) => unknown;
    closeOnClickOutside?: boolean;
  }): Promise<boolean>;
  choice<K extends string>(options: {
    content: (ctx: ChoiceContext<K>) => unknown;
    fallback?: K;
    closeOnClickOutside?: boolean;
  }): Promise<K | undefined>;
  show(options: {
    content: () => unknown;
    id?: string | number;
  }): string | number;
  close(id?: string | number): void;
}

// ── Internal: keyboard-navigable choice list ──────────────────────────────

/** Props for the keyboard-navigable choice list rendered inside a dialog */
interface ChoiceListProps<K extends string = string> {
  choices: ChoiceOption<K>[];
  accentColor: string;
  foregroundColor: string;
  mutedColor: string;
  highlightColor: string;
  resolve: (value: K) => void;
  dismiss: () => void;
  dialogId: DialogId;
}

/**
 * Internal component that renders a keyboard-navigable choice list.
 * Uses useDialogKeyboard scoped to the dialog so only the topmost
 * dialog receives keyboard events.
 */
function ChoiceList<K extends string = string>({
  choices,
  accentColor,
  foregroundColor,
  mutedColor,
  highlightColor,
  resolve,
  dismiss,
  dialogId,
}: ChoiceListProps<K>) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useDialogKeyboard((key) => {
    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => (prev < choices.length - 1 ? prev + 1 : 0));
    }
    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : choices.length - 1));
    }
    if (key.name === "return") {
      const choice = choices[selectedIndex];
      if (choice) resolve(choice.key);
    }
    if (key.name === "escape") {
      dismiss();
    }
  }, dialogId);

  return (
    <box flexDirection="column" gap={0}>
      {choices.map((choice, idx) => (
        <box flexDirection="row" gap={2} paddingLeft={1} paddingRight={1}>
          {/* Selection indicator */}
          <text fg={idx === selectedIndex ? accentColor : mutedColor}>
            {idx === selectedIndex ? "▶" : " "}
          </text>
          {/* Choice label */}
          <text
            fg={idx === selectedIndex ? foregroundColor : mutedColor}
            bg={idx === selectedIndex ? highlightColor : undefined}
            onMouseUp={() => resolve(choice.key)}
          >
            {choice.label}
          </text>
          {/* Optional description */}
          {choice.description && (
            <text dim fg={mutedColor}>
              — {choice.description}
            </text>
          )}
        </box>
      ))}
    </box>
  );
}

// ── Dialog wrapper functions ───────────────────────────────────────────────

/**
 * Show a confirmation dialog styled with Hoox colors.
 * Returns `true` if confirmed, `false` if canceled or dismissed.
 *
 * @example
 * const confirmed = await showConfirm(dialog, {
 *   title: "Delete Worker",
 *   message: "This action cannot be undone.",
 *   confirmLabel: "Delete",
 *   cancelLabel: "Keep",
 * })
 */
export async function showConfirm(
  dialog: DialogHandle,
  options: ConfirmDialogOptions
): Promise<boolean> {
  return dialog.confirm({
    content: (ctx: ConfirmContext) => (
      <box flexDirection="column" padding={1} gap={1}>
        <text fg={Colors.accent}>
          <b>{options.title}</b>
        </text>
        <text fg={Colors.muted}>{options.message}</text>
        <box flexDirection="row" gap={2} justifyContent="flex-end">
          <text fg={Colors.muted} onMouseUp={() => ctx.resolve(false)}>
            {"  "}
            {options.cancelLabel ?? "Cancel"}
            {"  "}
          </text>
          <text
            fg={Colors.accent}
            bg={Colors.card}
            onMouseUp={() => ctx.resolve(true)}
          >
            {"  "}
            {options.confirmLabel ?? "Confirm"}
            {"  "}
          </text>
        </box>
      </box>
    ),
    closeOnClickOutside: options.closeOnClickOutside ?? true,
  });
}

/**
 * Show a multiple-choice dialog styled with Hoox colors.
 * Returns the selected choice key, or `fallback` if dismissed.
 *
 * @example
 * const action = await showChoice(dialog, {
 *   title: "Select Action",
 *   choices: [
 *     { key: "restart", label: "Restart Worker", description: "Graceful restart" },
 *     { key: "stop",    label: "Stop Worker",    description: "Immediate halt" },
 *   ],
 * })
 */
export async function showChoice<K extends string>(
  dialog: DialogHandle,
  options: ChoiceDialogOptions<K>
): Promise<K | undefined> {
  return dialog.choice<K>({
    content: (ctx: ChoiceContext<K>) => (
      <box flexDirection="column" padding={1} gap={1}>
        {/* Header */}
        <text fg={Colors.accent}>
          <b>{options.title}</b>
        </text>
        <text dim fg={Colors.muted}>
          Use ↑↓ to navigate, Enter to select, Esc to cancel
        </text>

        {/* Divider */}
        <box height={1} />

        {/* Keyboard-navigable choice list */}
        <ChoiceList
          choices={options.choices}
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
    fallback: options.fallback,
    closeOnClickOutside: options.closeOnClickOutside ?? true,
  });
}

/**
 * Show a non-interactive loading dialog (centered, dimmed backdrop).
 * Returns a `close` function to dismiss the dialog when loading completes.
 *
 * @example
 * const close = showLoading(dialog, "Deploying workers...")
 * await deployAll()
 * close()
 */
export function showLoading(dialog: DialogHandle, message: string): () => void {
  const id = dialog.show({
    content: () => (
      <box
        flexDirection="column"
        padding={2}
        gap={1}
        justifyContent="center"
        alignItems="center"
      >
        <text fg={Colors.accent}>{message}</text>
        <text dim fg={Colors.muted}>
          Please wait...
        </text>
      </box>
    ),
  });
  return () => dialog.close(id);
}
