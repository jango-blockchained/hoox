/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  isGitRepo,
  isSubmodule,
  isGitTracked,
  gitPull,
  gitSubmoduleUpdate,
  gitUntrackFile,
} from "./git.js";

// ---------------------------------------------------------------------------
// Helpers — following cloudflare-service.test.ts patterns
// ---------------------------------------------------------------------------

const realSpawn = Bun.spawn;

type MockSpawnResult = {
  stdout: Blob;
  stderr: Blob;
  exited: Promise<number>;
  stdin?: {
    write: ReturnType<typeof mock>;
    end: ReturnType<typeof mock>;
  };
  kill: ReturnType<typeof mock>;
};

function makeSpawnResult(
  stdoutText: string,
  stderrText: string,
  exitCode: number
): MockSpawnResult {
  return {
    stdout: new Blob([stdoutText]),
    stderr: new Blob([stderrText]),
    exited: Promise.resolve(exitCode),
    stdin: {
      write: mock(() => {}),
      end: mock(() => {}),
    },
    kill: mock(() => {}),
  };
}

function successSpawn(stdout: string): MockSpawnResult {
  return makeSpawnResult(stdout, "", 0);
}

function errorSpawn(stderr: string, exitCode = 1): MockSpawnResult {
  return makeSpawnResult("", stderr, exitCode);
}

let lastSpawnCmd: string[] = [];

function mockSpawnWithCapture(result: MockSpawnResult): void {
  const _spawnMock = mock((cmd: string[], _options?: { cwd?: string }) => {
    lastSpawnCmd = cmd;
    return result;
  });
  (Bun as unknown as Record<string, unknown>).spawn = _spawnMock;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  lastSpawnCmd = [];
});

afterEach(() => {
  (Bun as unknown as Record<string, unknown>).spawn = realSpawn;
  mock.restore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isGitRepo", () => {
  it("returns true when inside a git work-tree", async () => {
    mockSpawnWithCapture(successSpawn("true"));

    const result = await isGitRepo("/some/project");

    expect(result).toBe(true);
    expect(lastSpawnCmd).toEqual(["git", "rev-parse", "--is-inside-work-tree"]);
  });

  it("returns false when not inside a git work-tree", async () => {
    mockSpawnWithCapture(errorSpawn("fatal: not a git repository"));

    const result = await isGitRepo("/not/git");

    expect(result).toBe(false);
  });
});

describe("isSubmodule", () => {
  it("returns true when path is a registered submodule", async () => {
    mockSpawnWithCapture(successSpawn(" 1234567 some/path (v1.0)"));

    const result = await isSubmodule("/project", "workers/hoox-worker");

    expect(result).toBe(true);
    expect(lastSpawnCmd).toEqual([
      "git",
      "submodule",
      "status",
      "--",
      "workers/hoox-worker",
    ]);
  });

  it("returns false when path is not a submodule (empty output)", async () => {
    mockSpawnWithCapture(successSpawn(""));

    const result = await isSubmodule("/project", "not-a-submodule");

    expect(result).toBe(false);
  });

  it("returns false when git exits non-zero", async () => {
    mockSpawnWithCapture(errorSpawn("fatal: not a git repository"));

    const result = await isSubmodule("/project", "workers/hoox-worker");

    expect(result).toBe(false);
  });

  it("returns false when stdout is only whitespace", async () => {
    mockSpawnWithCapture(successSpawn("  \n  "));

    const result = await isSubmodule("/project", "workers/hoox-worker");

    expect(result).toBe(false);
  });
});

describe("isGitTracked", () => {
  it("returns true when file is tracked by git", async () => {
    mockSpawnWithCapture(successSpawn("src/index.ts"));

    const result = await isGitTracked("/project", "src/index.ts");

    expect(result).toBe(true);
    expect(lastSpawnCmd).toEqual([
      "git",
      "ls-files",
      "--error-unmatch",
      "src/index.ts",
    ]);
  });

  it("returns false when file is not tracked", async () => {
    mockSpawnWithCapture(errorSpawn(""));

    const result = await isGitTracked("/project", "untracked.ts");

    expect(result).toBe(false);
  });

  it("returns false when Bun.spawn throws", async () => {
    const spawnMock = mock(() => {
      throw new Error("ENOENT");
    });
    (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

    const result = await isGitTracked("/project", "src/index.ts");

    expect(result).toBe(false);
  });
});

describe("gitPull", () => {
  it("returns stdout on successful pull", async () => {
    mockSpawnWithCapture(successSpawn("Already up to date."));

    const result = await gitPull("/project");

    expect(result).toBe("Already up to date.");
    expect(lastSpawnCmd).toEqual(["git", "pull", "--ff-only"]);
  });

  it("throws on non-zero exit", async () => {
    mockSpawnWithCapture(
      errorSpawn("error: cannot pull with rebase: You have unstaged changes.")
    );

    await expect(gitPull("/project")).rejects.toThrow(
      "error: cannot pull with rebase: You have unstaged changes."
    );
  });

  it("throws with fallback message when stderr is empty", async () => {
    mockSpawnWithCapture(makeSpawnResult("", "", 1));

    await expect(gitPull("/project")).rejects.toThrow(
      "git pull failed (exit 1)"
    );
  });
});

describe("gitSubmoduleUpdate", () => {
  it("returns stdout on successful submodule update", async () => {
    mockSpawnWithCapture(
      successSpawn("Submodule path 'workers/hoox-worker': checked out 'abc123'")
    );

    const result = await gitSubmoduleUpdate("/project", "workers/hoox-worker");

    expect(result).toContain("workers/hoox-worker");
    expect(lastSpawnCmd).toEqual([
      "git",
      "submodule",
      "update",
      "--remote",
      "--init",
      "--",
      "workers/hoox-worker",
    ]);
  });

  it("throws on non-zero exit", async () => {
    mockSpawnWithCapture(
      errorSpawn("fatal: No url found for submodule path 'workers/hoox-worker'")
    );

    await expect(
      gitSubmoduleUpdate("/project", "workers/hoox-worker")
    ).rejects.toThrow("No url found for submodule path 'workers/hoox-worker'");
  });

  it("throws with fallback message when stderr is empty", async () => {
    mockSpawnWithCapture(makeSpawnResult("", "", 1));

    await expect(
      gitSubmoduleUpdate("/project", "workers/hoox-worker")
    ).rejects.toThrow("git submodule update failed (exit 1)");
  });
});

describe("gitUntrackFile", () => {
  it("resolves when git rm --cached succeeds", async () => {
    mockSpawnWithCapture(makeSpawnResult("rm 'file-to-untrack.ts'", "", 0));

    await gitUntrackFile("/project", "file-to-untrack.ts");

    expect(lastSpawnCmd).toEqual([
      "git",
      "rm",
      "--cached",
      "file-to-untrack.ts",
    ]);
  });

  it("rejects when git rm --cached fails", async () => {
    mockSpawnWithCapture(
      errorSpawn("fatal: pathspec 'missing.ts' did not match any file")
    );

    await expect(gitUntrackFile("/project", "missing.ts")).rejects.toThrow(
      "git rm --cached failed with code 1"
    );
  });

  it("rejects when Bun.spawn throws", async () => {
    const spawnMock = mock(() => {
      throw new Error("spawn error");
    });
    (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

    await expect(gitUntrackFile("/project", "file.ts")).rejects.toThrow();
  });
});
