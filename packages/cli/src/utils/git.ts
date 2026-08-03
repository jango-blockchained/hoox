/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared git utilities for Hoox CLI.
 *
 * All functions use Bun.spawn for asynchronous git operations.
 * Bun is a global in the Bun runtime — no import needed.
 */

// ---------------------------------------------------------------------------
// Repository and working tree checks
// ---------------------------------------------------------------------------

/**
 * Check if `cwd` is inside a git work-tree.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
}

/**
 * Check whether a path inside `cwd` is a registered git submodule.
 */
export async function isSubmodule(
  cwd: string,
  submodulePath: string
): Promise<boolean> {
  const proc = Bun.spawn(["git", "submodule", "status", "--", submodulePath], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) return false;
  const out = (await new Response(proc.stdout).text()).trim();
  return out.length > 0;
}

/**
 * Check if a specific file inside `dir` is tracked by git.
 */
export async function isGitTracked(
  dir: string,
  filename: string
): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "ls-files", "--error-unmatch", filename], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Git operations
// ---------------------------------------------------------------------------

/**
 * Run `git pull --ff-only` inside `cwd`.
 */
export async function gitPull(cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", "pull", "--ff-only"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git pull failed (exit ${exitCode})`);
  }
  return stdout.trim();
}

/**
 * Run `git submodule update --remote --init` for a specific submodule path.
 */
export async function gitSubmoduleUpdate(
  cwd: string,
  submodulePath: string
): Promise<string> {
  const proc = Bun.spawn(
    ["git", "submodule", "update", "--remote", "--init", "--", submodulePath],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    throw new Error(
      stderr.trim() || `git submodule update failed (exit ${exitCode})`
    );
  }
  return stdout.trim();
}

/**
 * Run `git rm --cached` to remove a file from git tracking while keeping it
 * on disk.
 */
export async function gitUntrackFile(
  dir: string,
  filename: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = Bun.spawn(["git", "rm", "--cached", filename], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.exited
      .then((code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`git rm --cached failed with code ${code}`));
      })
      .catch(reject);
  });
}
