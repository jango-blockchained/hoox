/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Clipboard helpers for the Hoox TUI.
 *
 * Strategy (first success wins):
 *   1. OpenTUI OSC 52 via CliRenderer.copyToClipboardOSC52 (works over SSH
 *      when the terminal allows it)
 *   2. Platform tools: wl-copy / xclip / xsel (Linux), pbcopy (macOS),
 *      clip (Windows)
 *
 * Used for auto-copy on mouse text selection.
 */
import { getRendererRef } from "../hooks";
import {
  toastCopiedToClipboard,
  toastCopyFailed,
} from "../components/ui/toast";

/** Minimal surface we need from OpenTUI's CliRenderer (typed loosely for packages). */
export type ClipboardRenderer = {
  copyToClipboardOSC52: (text: string) => boolean;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

export type ClipboardResult =
  | { ok: true; method: "osc52" | "system"; tool?: string }
  | { ok: false; error: string };

const SYSTEM_CLIPBOARD_CANDIDATES: { bin: string; args: string[] }[] = [
  { bin: "wl-copy", args: [] },
  { bin: "xclip", args: ["-selection", "clipboard"] },
  { bin: "xsel", args: ["--clipboard", "--input"] },
  { bin: "pbcopy", args: [] },
  { bin: "clip.exe", args: [] },
  { bin: "clip", args: [] },
];

/**
 * Write text to the system clipboard via a known clipboard utility.
 * Returns the tool name on success, or null if none worked.
 */
export async function copyViaSystemClipboard(
  text: string
): Promise<string | null> {
  for (const { bin, args } of SYSTEM_CLIPBOARD_CANDIDATES) {
    if (!Bun.which(bin)) continue;
    try {
      const proc = Bun.spawn([bin, ...args], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
      });
      proc.stdin.write(text);
      proc.stdin.end();
      const code = await proc.exited;
      if (code === 0) return bin;
    } catch {
      // try next tool
    }
  }
  return null;
}

export interface CopyToClipboardOptions {
  /**
   * Show a success/error toast. Default false so generic callers stay quiet;
   * auto-copy on selection opts in.
   */
  notify?: boolean;
}

/**
 * Copy text using the best available method for the current environment.
 *
 * @param text - Content to copy (empty / whitespace-only is a no-op success)
 * @param renderer - Optional renderer for OSC 52; falls back to getRendererRef()
 * @param options - Optional `{ notify: true }` for toast feedback
 */
export async function copyToClipboard(
  text: string,
  renderer?: ClipboardRenderer | null,
  options?: CopyToClipboardOptions
): Promise<ClipboardResult> {
  if (!text || !text.trim()) {
    return { ok: true, method: "osc52" };
  }

  const notify = options?.notify === true;

  const r = (renderer ??
    (getRendererRef() as ClipboardRenderer | null)) as ClipboardRenderer | null;
  if (r && typeof r.copyToClipboardOSC52 === "function") {
    try {
      const ok = Boolean(r.copyToClipboardOSC52(text));
      if (ok) {
        // Still try system clipboard so local paste works even when OSC 52
        // only reaches the remote terminal emulator.
        void copyViaSystemClipboard(text);
        if (notify) toastCopiedToClipboard(text);
        return { ok: true, method: "osc52" };
      }
    } catch {
      // fall through to system tools
    }
  }

  const tool = await copyViaSystemClipboard(text);
  if (tool) {
    if (notify) toastCopiedToClipboard(text);
    return { ok: true, method: "system", tool };
  }

  const error =
    "No clipboard backend available (OSC 52 failed; install wl-copy/xclip/pbcopy)";
  if (notify) toastCopyFailed(error);
  return {
    ok: false,
    error,
  };
}

/**
 * Wire auto-copy when the user finishes a mouse text selection.
 * Call once after createCliRenderer + setRendererRef.
 *
 * OpenTUI emits `"selection"` from finishSelection() with isDragging=false.
 * We only copy non-empty selections and ignore pure clicks (empty text).
 */
export function enableAutoCopyOnSelection(
  renderer: ClipboardRenderer
): () => void {
  let lastCopied = "";
  let lastAt = 0;

  const onSelection = (...args: unknown[]) => {
    const selection = args[0] as
      | {
          isDragging?: boolean;
          getSelectedText?: () => string;
        }
      | undefined;
    if (selection?.isDragging) return;
    const text = selection?.getSelectedText?.() ?? "";
    if (!text.trim()) return;

    // Debounce identical rapid emissions
    const now = Date.now();
    if (text === lastCopied && now - lastAt < 400) return;
    lastCopied = text;
    lastAt = now;

    void copyToClipboard(text, renderer, { notify: true });
  };

  renderer.on("selection", onSelection);
  return () => {
    renderer.off("selection", onSelection);
  };
}
