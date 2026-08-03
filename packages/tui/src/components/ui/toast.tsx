/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thin wrappers around @opentui-ui/toast with Hoox color token defaults.
 * Provides toast helper functions (success, error, warning, info, loading)
 * pre-configured with Hoox design system colors and durations.
 *
 * All helpers use the global toast singleton from @opentui-ui/toast.
 * A ToasterRenderable must be initialized in the app root before calling
 * these functions (see app.tsx).
 */
import { toast, TOAST_DURATION } from "@opentui-ui/toast";
import { Colors } from "@hoox-sh/hoox-shared";

// ── Types ──────────────────────────────────────────────────────────────────

/** Options that can be passed to any toast helper */
export interface ToastOptions {
  /** Additional description text below the message */
  description?: string;
  /** Auto-dismiss duration in ms (overrides the helper's default) */
  duration?: number;
  /** Whether the toast can be manually dismissed (default: true) */
  dismissible?: boolean;
  /** Action button with label and click handler */
  action?: { label: string; onClick: () => void };
  /** Show a close button on the toast (default: false) */
  closeButton?: boolean;
}

/** Returned toast ID for programmatic control */
export type ToastId = string | number;

// ── Hoox-styled toast style overrides ──────────────────────────────────────

/** Base style shared across all toast types */
const baseStyle = {
  backgroundColor: Colors.card,
  foregroundColor: Colors.foreground,
  borderColor: Colors.border,
  paddingX: 1,
  paddingY: 0,
};

/** Per-type border color overrides using Hoox design tokens */
const hooxTypeStyles = {
  success: { borderColor: Colors.success },
  error: { borderColor: Colors.error },
  warning: { borderColor: Colors.warning },
  info: { borderColor: Colors.highlight },
  loading: { borderColor: Colors.dim },
};

// ── Toast helper functions ─────────────────────────────────────────────────

/**
 * Show a success toast notification.
 * Uses green border (Colors.success) and 3s auto-dismiss.
 *
 * @example
 * toastSuccess("Worker deployed successfully")
 */
export function toastSuccess(message: string, options?: ToastOptions): ToastId {
  return toast.success(message, {
    ...options,
    style: { ...baseStyle, ...hooxTypeStyles.success },
    duration: options?.duration ?? TOAST_DURATION.SHORT,
  });
}

/**
 * Show an error toast notification.
 * Uses red border (Colors.error) and 6s auto-dismiss.
 *
 * @example
 * toastError("Failed to connect to API", { description: "Check your network" })
 */
export function toastError(message: string, options?: ToastOptions): ToastId {
  return toast.error(message, {
    ...options,
    style: { ...baseStyle, ...hooxTypeStyles.error },
    duration: options?.duration ?? TOAST_DURATION.LONG,
  });
}

/**
 * Show a warning toast notification.
 * Uses amber border (Colors.warning) and 6s auto-dismiss.
 *
 * @example
 * toastWarning("Rate limit approaching", { description: "Slow down requests" })
 */
export function toastWarning(message: string, options?: ToastOptions): ToastId {
  return toast.warning(message, {
    ...options,
    style: { ...baseStyle, ...hooxTypeStyles.warning },
    duration: options?.duration ?? TOAST_DURATION.LONG,
  });
}

/**
 * Show an info toast notification.
 * Uses accent border (Colors.accent, orange) and 4s auto-dismiss.
 *
 * @example
 * toastInfo("New version available", { action: { label: "Update", onClick: () => {} } })
 */
export function toastInfo(message: string, options?: ToastOptions): ToastId {
  return toast.info(message, {
    ...options,
    style: { ...baseStyle, ...hooxTypeStyles.info },
    duration: options?.duration ?? TOAST_DURATION.DEFAULT,
  });
}

/**
 * Show a persistent loading toast notification.
 * Uses muted border (Colors.muted) and does NOT auto-dismiss.
 * Returns the toast ID so it can be updated to success/error later.
 *
 * @example
 * const id = toastLoading("Deploying worker...")
 * try {
 *   await deploy()
 *   toastSuccess("Deployed!", { id })
 * } catch {
 *   toastError("Deploy failed", { id })
 * }
 */
export function toastLoading(
  message: string,
  options?: Omit<ToastOptions, "duration">
): ToastId {
  return toast.loading(message, {
    ...options,
    style: { ...baseStyle, ...hooxTypeStyles.loading },
    duration: TOAST_DURATION.PERSISTENT,
  } as ToastOptions);
}

/**
 * Dismiss a specific toast or all toasts.
 * Thin wrapper around toast.dismiss().
 *
 * @example
 * dismissToast(id)   // dismiss specific
 * dismissToast()     // dismiss all
 */
export function dismissToast(id?: ToastId): void {
  toast.dismiss(id as string | number | undefined);
}

// ── Clipboard copy feedback ────────────────────────────────────────────────

const COPY_PREVIEW_MAX = 48;

/** Pure message for “copied” toast (testable). */
export function messageCopiedToClipboard(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Copied to clipboard";
  if (oneLine.length <= COPY_PREVIEW_MAX) {
    return `Copied: “${oneLine}”`;
  }
  return `Copied: “${oneLine.slice(0, COPY_PREVIEW_MAX - 1)}…”`;
}

/** Toast after successful clipboard write (selection auto-copy, etc.). */
export function toastCopiedToClipboard(text: string): ToastId {
  const lines = text.split("\n").filter((l) => l.length > 0).length;
  return toastSuccess(messageCopiedToClipboard(text), {
    description: lines > 1 ? `${lines} lines` : undefined,
    duration: 2500,
  });
}

/** Toast when clipboard write fails. */
export function toastCopyFailed(error: string): ToastId {
  return toastError("Copy failed", {
    description: error,
    duration: 5000,
  });
}
