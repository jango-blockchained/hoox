/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Path Resolution Service for Hoox
 *
 * Provides cross-OS utilities for resolving the $HOME/.hoox directory location
 * and constructing type-safe paths within it.
 *
 * Supports macOS, Linux, and Windows with proper fallback handling.
 *
 * Runtime layout:
 *   $HOME/.hoox/              — getHooxHome() (override with HOOX_HOME)
 *   $HOME/.hoox/repo/         — managed clone of hoox-setup (getHooxRepoPath)
 *   $HOME/.hoox/config/       — user config
 *   $HOME/.hoox/data/         — persistent state
 *
 * Tool/runtime resolution (resolveHooxRuntimeRoot):
 *   1. HOOX_REPO env (explicit monorepo path)
 *   2. Walk up from cwd for a local hoox-setup checkout
 *   3. $HOME/.hoox/repo (global managed clone)
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

/**
 * Branded type for Hoox paths to prevent accidental string usage.
 * This ensures type safety when working with paths.
 */
export type HooxPath = string & { readonly __brand: "HooxPath" };

/** Where resolveHooxRuntimeRoot found (or failed to find) a setup monorepo. */
export type RuntimeRootSource = "env" | "cwd" | "global" | "none";

/** Result of resolveHooxRuntimeRoot(). */
export interface RuntimeRootResult {
  /** Absolute monorepo root, or null if none found. */
  root: string | null;
  /** Which resolution step produced the result. */
  source: RuntimeRootSource;
  /** Paths inspected (for doctor / error messages). */
  checked: {
    env?: string;
    cwd: string | null;
    global: string;
  };
}

/**
 * Creates a branded HooxPath from a string.
 * @internal Use only internally; prefer getHooxHome() and resolveHooxPath()
 */
function createHooxPath(path: string): HooxPath {
  return path as HooxPath;
}

/**
 * Gets the Hoox home directory location: $HOME/.hoox
 *
 * Behavior:
 * - HOOX_HOME env wins when set (absolute or relative, then resolved)
 * - Else $HOME/.hoox on macOS, Linux, Windows
 * - Falls back to current working directory if HOME is not available
 * - Resolves to absolute path
 *
 * @returns Absolute path to $HOME/.hoox as a branded HooxPath
 * @throws Never — always returns a valid path
 *
 * @example
 * ```typescript
 * const hooxHome = getHooxHome();
 * // Returns: "/Users/alice/.hoox" (macOS)
 * // Returns: "/home/alice/.hoox" (Linux)
 * // Returns: "C:\\Users\\alice\\.hoox" (Windows)
 * ```
 */
export function getHooxHome(): HooxPath {
  try {
    const override = process.env.HOOX_HOME?.trim();
    if (override) {
      return createHooxPath(resolve(override));
    }
    const home = homedir();
    if (!home || home.length === 0) {
      // Fallback: use current working directory
      return createHooxPath(resolve(process.cwd(), ".hoox"));
    }
    return createHooxPath(join(home, ".hoox"));
  } catch {
    // Fallback: use current working directory if homedir() throws
    return createHooxPath(resolve(process.cwd(), ".hoox"));
  }
}

/**
 * True when `dir` looks like a hoox-setup monorepo root.
 *
 * Markers match CLI verifyRepoRoot: root wrangler.jsonc + packages/cli package.
 */
export function isHooxSetupRoot(dir: string): boolean {
  if (!dir) return false;
  try {
    const root = resolve(dir);
    return (
      existsSync(join(root, "wrangler.jsonc")) &&
      existsSync(join(root, "packages", "cli", "package.json"))
    );
  } catch {
    return false;
  }
}

/**
 * Walk up from `startDir` looking for a hoox-setup monorepo root.
 *
 * @returns Absolute root path, or null if not found
 */
export function findHooxSetupRoot(
  startDir: string = process.cwd()
): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (isHooxSetupRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve the Hoox tool/runtime monorepo root (local checkout or global clone).
 *
 * Order:
 *   1. HOOX_REPO — must pass isHooxSetupRoot or result is source "env" with root null
 *   2. Walk up from cwd
 *   3. getHooxRepoPath() ($HOME/.hoox/repo or $HOOX_HOME/repo)
 *
 * Project cwd and tool root are intentionally separate: a random project
 * directory can still use the global runtime for TUI / templates.
 */
export function resolveHooxRuntimeRoot(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): RuntimeRootResult {
  const env = options?.env ?? process.env;
  const cwd = resolve(options?.cwd ?? process.cwd());
  const globalRepo = getHooxRepoPath();

  const envRepo = env.HOOX_REPO?.trim();
  if (envRepo) {
    const resolved = resolve(envRepo);
    if (isHooxSetupRoot(resolved)) {
      return {
        root: resolved,
        source: "env",
        checked: {
          env: resolved,
          cwd: findHooxSetupRoot(cwd),
          global: globalRepo,
        },
      };
    }
    return {
      root: null,
      source: "env",
      checked: {
        env: resolved,
        cwd: findHooxSetupRoot(cwd),
        global: globalRepo,
      },
    };
  }

  const local = findHooxSetupRoot(cwd);
  if (local) {
    return {
      root: local,
      source: "cwd",
      checked: { cwd: local, global: globalRepo },
    };
  }

  if (isHooxSetupRoot(globalRepo)) {
    return {
      root: globalRepo,
      source: "global",
      checked: { cwd: null, global: globalRepo },
    };
  }

  return {
    root: null,
    source: "none",
    checked: { cwd: null, global: globalRepo },
  };
}

/**
 * Candidate TUI entry files under a monorepo root (source first, then dist).
 */
export function getTuiEntryCandidates(runtimeRoot: string): string[] {
  const root = resolve(runtimeRoot);
  return [
    join(root, "packages", "tui", "src", "main.tsx"),
    join(root, "packages", "tui", "dist", "main.js"),
    join(root, "packages", "tui", "src", "main.ts"),
  ];
}

/**
 * Resolves a relative path within the Hoox home directory.
 *
 * Behavior:
 * - Joins the relative path with $HOME/.hoox
 * - Resolves to absolute path
 * - Prevents path traversal attacks (../ sequences)
 *
 * @param relativePath - Path relative to $HOME/.hoox (e.g., "repo", "config/wrangler.jsonc")
 * @returns Absolute path as a branded HooxPath
 * @throws Error if path contains suspicious traversal patterns
 *
 * @example
 * ```typescript
 * const repoPath = resolveHooxPath("repo");
 * // Returns: "/Users/alice/.hoox/repo"
 *
 * const configPath = resolveHooxPath("config/wrangler.jsonc");
 * // Returns: "/Users/alice/.hoox/config/wrangler.jsonc"
 * ```
 */
export function resolveHooxPath(relativePath: string): HooxPath {
  // Validate input
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("relativePath must be a non-empty string");
  }

  // Prevent path traversal attacks
  if (relativePath.includes("..")) {
    throw new Error(
      `Path traversal detected in relativePath: "${relativePath}"`
    );
  }

  // Normalize backslashes to forward slashes for cross-OS compatibility.
  // On Windows, both / and \ are valid path separators; on Linux/macOS
  // backslashes are NOT path separators, so normalizing ensures consistent
  // behavior regardless of which separator the caller used.
  const normalizedPath = relativePath.replace(/\\/g, "/");

  const hooxHome = getHooxHome();
  const fullPath = join(hooxHome, normalizedPath);

  // Ensure the resolved path is still within hooxHome (security check)
  const resolvedPath = resolve(fullPath);
  const resolvedHome = resolve(hooxHome);

  if (!resolvedPath.startsWith(resolvedHome)) {
    throw new Error(
      `Resolved path "${resolvedPath}" is outside Hoox home directory`
    );
  }

  return createHooxPath(resolvedPath);
}

/**
 * Checks if a given path is within the Hoox home directory.
 *
 * @param path - Path to check
 * @returns true if path is within $HOME/.hoox, false otherwise
 *
 * @example
 * ```typescript
 * isWithinHooxHome("/Users/alice/.hoox/repo"); // true
 * isWithinHooxHome("/Users/alice/other"); // false
 * ```
 */
export function isWithinHooxHome(path: string): boolean {
  try {
    const hooxHome = getHooxHome();
    const resolvedPath = resolve(path);
    const resolvedHome = resolve(hooxHome);
    return resolvedPath.startsWith(resolvedHome);
  } catch {
    return false;
  }
}

/**
 * Gets the relative path from Hoox home directory.
 *
 * @param absolutePath - Absolute path to resolve
 * @returns Relative path from $HOME/.hoox, or null if path is outside Hoox home
 *
 * @example
 * ```typescript
 * getRelativeHooxPath("/Users/alice/.hoox/repo/src");
 * // Returns: "repo/src"
 *
 * getRelativeHooxPath("/Users/alice/other");
 * // Returns: null
 * ```
 */
export function getRelativeHooxPath(absolutePath: string): string | null {
  try {
    if (!isWithinHooxHome(absolutePath)) {
      return null;
    }

    const hooxHome = getHooxHome();
    const resolvedPath = resolve(absolutePath);
    const resolvedHome = resolve(hooxHome);

    // Remove trailing slashes for consistent comparison
    const relativePath = resolvedPath.slice(resolvedHome.length);
    return relativePath.startsWith("/") || relativePath.startsWith("\\")
      ? relativePath.slice(1)
      : relativePath;
  } catch {
    return null;
  }
}

/**
 * Constructs a path to the Hoox repository location.
 *
 * @returns Path to $HOME/.hoox/repo as a branded HooxPath
 *
 * @example
 * ```typescript
 * const repoPath = getHooxRepoPath();
 * // Returns: "/Users/alice/.hoox/repo"
 * ```
 */
export function getHooxRepoPath(): HooxPath {
  return resolveHooxPath("repo");
}

/**
 * Constructs a path to the Hoox configuration directory.
 *
 * @returns Path to $HOME/.hoox/config as a branded HooxPath
 *
 * @example
 * ```typescript
 * const configDir = getHooxConfigDir();
 * // Returns: "/Users/alice/.hoox/config"
 * ```
 */
export function getHooxConfigDir(): HooxPath {
  return resolveHooxPath("config");
}

/**
 * Constructs a path to the Hoox data directory.
 *
 * @returns Path to $HOME/.hoox/data as a branded HooxPath
 *
 * @example
 * ```typescript
 * const dataDir = getHooxDataDir();
 * // Returns: "/Users/alice/.hoox/data"
 * ```
 */
export function getHooxDataDir(): HooxPath {
  return resolveHooxPath("data");
}

/**
 * Constructs a path to the Hoox wrangler configuration file.
 *
 * @returns Path to $HOME/.hoox/config/wrangler.jsonc as a branded HooxPath
 *
 * @example
 * ```typescript
 * const wranglerPath = getHooxWranglerPath();
 * // Returns: "/Users/alice/.hoox/config/wrangler.jsonc"
 * ```
 */
export function getHooxWranglerPath(): HooxPath {
  return resolveHooxPath("config/wrangler.jsonc");
}

/**
 * Constructs a path to the Hoox state file.
 *
 * @returns Path to $HOME/.hoox/data/state.json as a branded HooxPath
 *
 * @example
 * ```typescript
 * const statePath = getHooxStatePath();
 * // Returns: "/Users/alice/.hoox/data/state.json"
 * ```
 */
export function getHooxStatePath(): HooxPath {
  return resolveHooxPath("data/state.json");
}
