/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TUI file-backed JSON storage.
 *
 * Bun has no `localStorage` global. Persist small TUI state under
 * `$HOME/.hoox/.tui-state/` (via hoox-path-service) so chat history,
 * query history, and similar UI state survive restarts.
 */
import { unlink } from "fs/promises";
import { ensureTuiStateDir, resolveTuiStatePath } from "./hoox-path-service";

/** Well-known state file names under `.tui-state/`. */
export const TuiStateFiles = {
  chatHistory: "chat-history.json",
  dbQueryHistory: "db-query-history.json",
} as const;

/**
 * Read a JSON document from the TUI state directory.
 * Returns `fallback` when the file is missing or unreadable.
 */
export async function readJsonState<T>(
  filename: string,
  fallback: T
): Promise<T> {
  try {
    await ensureTuiStateDir();
    const path = resolveTuiStatePath(filename);
    const file = Bun.file(path);
    if (!(await file.exists())) return fallback;
    const parsed = (await file.json()) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON document to the TUI state directory.
 * Failures are silent — persistence is best-effort.
 */
export async function writeJsonState(
  filename: string,
  value: unknown
): Promise<void> {
  try {
    await ensureTuiStateDir();
    const path = resolveTuiStatePath(filename);
    await Bun.write(path, JSON.stringify(value, null, 0));
  } catch {
    // Non-fatal: disk full, permissions, etc.
  }
}

/**
 * Remove a JSON document from the TUI state directory.
 * Missing files are ignored.
 */
export async function removeJsonState(filename: string): Promise<void> {
  try {
    const path = resolveTuiStatePath(filename);
    await unlink(path);
  } catch {
    // Missing or unreadable — ignore
  }
}
