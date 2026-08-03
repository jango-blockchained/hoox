/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hoox Path Service — TUI-specific path resolution for state and config.
 *
 * Provides utilities for:
 *   - Resolving the Hoox home directory ($HOME/.hoox)
 *   - Creating/accessing the .tui-state directory for persistent state
 *   - Falling back to current working directory if home location is not available
 *
 * Uses getHooxHome() from the shared package for cross-OS path resolution.
 *
 * @example
 * ```typescript
 * import { getTuiStateDir, ensureTuiStateDir } from "./services/hoox-path-service";
 *
 * const dir = await ensureTuiStateDir();
 * // Returns: "/Users/alice/.hoox/.tui-state" (macOS/Linux)
 * // Returns: "/home/alice/.hoox/.tui-state" (Linux)
 * // Falls back to: "/current/working/dir/.tui-state" if HOME is unavailable
 * ```
 */
import { getHooxHome, type HooxPath } from "@hoox-sh/hoox-shared";
import { join, resolve } from "path";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";

/**
 * Subdirectory name for TUI persistent state within the Hoox home directory.
 */
const TUI_STATE_DIR = ".tui-state";

/**
 * Gets the TUI state directory path: $HOME/.hoox/.tui-state
 *
 * Falls back to <cwd>/.tui-state if the home directory is not available.
 * This fallback ensures the TUI remains functional even in environments
 * where $HOME is not set (e.g., some CI runners, containers).
 *
 * @returns Absolute path to the TUI state directory
 */
export function getTuiStateDir(): string {
  try {
    const hooxHome = getHooxHome();
    return join(hooxHome, TUI_STATE_DIR);
  } catch {
    // Fallback: use current working directory
    return resolve(process.cwd(), TUI_STATE_DIR);
  }
}

/**
 * Ensures the TUI state directory exists, creating it if necessary.
 *
 * This should be called during TUI initialization to make sure
 * persistent state can be written. Uses mkdir with recursive option.
 * Falls back to <cwd>/.tui-state if the primary path cannot be created.
 *
 * @returns The path to the TUI state directory that was ensured
 * @throws If the directory cannot be created (even after fallback)
 */
export async function ensureTuiStateDir(): Promise<string> {
  const dir = getTuiStateDir();
  try {
    await mkdir(dir, { recursive: true });
    return dir;
  } catch {
    // mkdir on primary path failed — fall back to current working directory
    const fallback = resolve(process.cwd(), TUI_STATE_DIR);
    await mkdir(fallback, { recursive: true });
    return fallback;
  }
}

/**
 * Checks whether the TUI state directory already exists on disk.
 *
 * @returns true if .tui-state directory exists, false otherwise
 */
export function tuiStateDirExists(): boolean {
  try {
    return existsSync(getTuiStateDir());
  } catch {
    return false;
  }
}

/**
 * Resolves a path within the TUI state directory.
 *
 * @param subpath - Relative path within .tui-state (e.g., "session.json", "crash.log")
 * @returns Absolute path to the file within the TUI state directory
 *
 * @example
 * ```typescript
 * const sessionPath = resolveTuiStatePath("session.json");
 * // Returns: "/Users/alice/.hoox/.tui-state/session.json"
 * ```
 */
export function resolveTuiStatePath(subpath: string): string {
  // Strip leading slash to ensure subpath is treated as relative.
  // On POSIX, path.join treats absolute paths as root-relative, but Bun may
  // handle this differently. Normalizing to relative prevents ambiguity.
  const normalized =
    subpath.startsWith("/") || subpath.startsWith("\\")
      ? subpath.slice(1)
      : subpath;
  return join(getTuiStateDir(), normalized);
}

/**
 * Resolves a path within the Hoox home directory.
 *
 * Delegates to the shared resolveHooxPath but exposed here for TUI convenience.
 *
 * @param relativePath - Path relative to $HOME/.hoox
 * @returns Absolute branded HooxPath
 */
export function resolveHooxHomePath(relativePath: string): HooxPath {
  const hooxHome = getHooxHome();
  return join(hooxHome, relativePath) as HooxPath;
}
