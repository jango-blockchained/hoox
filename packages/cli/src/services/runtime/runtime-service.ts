/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global Hoox runtime — managed monorepo clone under $HOME/.hoox/repo.
 *
 * Used when the CLI runs outside a local monorepo checkout (e.g. `hx tui`
 * from an unrelated project). Bootstrap clones + installs dependencies.
 *
 * Preferred lightweight path for TUI-only installs:
 *   bun add -g @jango-blockchained/hoox-tui
 */
import { existsSync, lstatSync, readlinkSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  getHooxHome,
  getHooxRepoPath,
  getTuiEntryCandidates,
  isHooxSetupRoot,
  resolveHooxRuntimeRoot,
  type RuntimeRootResult,
} from "@jango-blockchained/hoox-shared";

/** Default public monorepo URL for the managed global runtime. */
export const DEFAULT_HOOX_RUNTIME_REPO =
  "https://github.com/jango-blockchained/hoox.git";

/** @deprecated Use DEFAULT_HOOX_RUNTIME_REPO */
export const DEFAULT_HOOX_SETUP_REPO = DEFAULT_HOOX_RUNTIME_REPO;

export interface RuntimeStatus {
  hooxHome: string;
  repoPath: string;
  runtime: RuntimeRootResult;
  tuiEntry: string | null;
  repoPresent: boolean;
  isSetupRoot: boolean;
}

export interface EnsureRuntimeOptions {
  /** Git remote (default: jango-blockchained/hoox). */
  repoUrl?: string;
  /** Skip `bun install` after clone (tests / offline). */
  skipInstall?: boolean;
  /** Called with human-readable progress lines. */
  onLog?: (message: string) => void;
}

export interface EnsureRuntimeResult {
  repoPath: string;
  cloned: boolean;
  installed: boolean;
  tuiEntry: string | null;
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Snapshot of runtime resolution + TUI entry for doctor / errors. */
export function getRuntimeStatus(cwd: string = process.cwd()): RuntimeStatus {
  const runtime = resolveHooxRuntimeRoot({ cwd });
  const repoPath = getHooxRepoPath();
  const tuiEntry = runtime.root
    ? firstExisting(getTuiEntryCandidates(runtime.root))
    : null;

  return {
    hooxHome: getHooxHome(),
    repoPath,
    runtime,
    tuiEntry,
    repoPresent: existsSync(repoPath),
    isSetupRoot: isHooxSetupRoot(repoPath),
  };
}

async function runCommand(
  cmd: string[],
  cwd: string
): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, stdout, stderr };
}

/**
 * True when path is a symlink whose target is missing (common after renames).
 */
function isBrokenSymlink(path: string): boolean {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false;
    // existsSync follows the link; false means dangling
    return !existsSync(path);
  } catch {
    return false;
  }
}

/**
 * Ensure `$HOME/.hoox/repo` is a usable Hoox monorepo clone.
 * Clones shallow if missing; runs `bun install` when needed.
 * Removes dangling symlinks (e.g. old hoox-setup → deleted path) automatically.
 */
export async function ensureGlobalRuntime(
  options: EnsureRuntimeOptions = {}
): Promise<EnsureRuntimeResult> {
  const log = options.onLog ?? (() => {});
  const repoUrl = options.repoUrl ?? DEFAULT_HOOX_RUNTIME_REPO;
  const repoPath = getHooxRepoPath();
  const hooxHome = getHooxHome();

  await mkdir(hooxHome, { recursive: true });

  let cloned = false;
  if (!isHooxSetupRoot(repoPath)) {
    if (existsSync(repoPath) || isBrokenSymlink(repoPath)) {
      if (isBrokenSymlink(repoPath)) {
        let target = "";
        try {
          target = readlinkSync(repoPath);
        } catch {
          /* ignore */
        }
        log(
          `Removing broken runtime symlink ${repoPath}` +
            (target ? ` → ${target}` : "")
        );
        rmSync(repoPath, { force: true });
      } else {
        throw new Error(
          `Path exists but is not a Hoox monorepo: ${repoPath}\n` +
            `  Expected wrangler.jsonc + packages/cli/package.json.\n` +
            `  Remove it or set HOOX_REPO to a valid checkout, then retry.\n` +
            `  Lightweight alternative: bun add -g @jango-blockchained/hoox-tui`
        );
      }
    }
    if (!isHooxSetupRoot(repoPath)) {
      log(`Cloning ${repoUrl} → ${repoPath}`);
      const parent = hooxHome;
      const clone = await runCommand(
        ["git", "clone", "--depth", "1", repoUrl, repoPath],
        parent
      );
      if (!clone.ok) {
        throw new Error(
          `git clone failed:\n${clone.stderr || clone.stdout}`.trim()
        );
      }
      cloned = true;
    }
  } else {
    log(`Runtime already present: ${repoPath}`);
  }

  let installed = false;
  if (!options.skipInstall) {
    const nodeModules = join(repoPath, "node_modules");
    const tuiPkg = join(repoPath, "packages", "tui", "package.json");
    const needsInstall =
      !existsSync(nodeModules) ||
      (existsSync(tuiPkg) &&
        !existsSync(join(repoPath, "packages", "tui", "node_modules")) &&
        !existsSync(join(nodeModules, "@opentui")));

    // Always install after a fresh clone; otherwise only if deps look missing.
    if (cloned || needsInstall || !existsSync(nodeModules)) {
      log(`Running bun install in ${repoPath}`);
      const install = await runCommand(["bun", "install"], repoPath);
      if (!install.ok) {
        throw new Error(
          `bun install failed:\n${install.stderr || install.stdout}`.trim()
        );
      }
      installed = true;
    }
  }

  const tuiEntry = firstExisting(getTuiEntryCandidates(repoPath));
  return { repoPath, cloned, installed, tuiEntry };
}
