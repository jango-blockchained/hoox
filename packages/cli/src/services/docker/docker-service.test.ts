/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { DockerService } from "./docker-service.js";

// ---------------------------------------------------------------------------
// Helpers — following cloudflare-service.test.ts patterns
// ---------------------------------------------------------------------------

const realSpawn = Bun.spawn;
const realWhich = Bun.which;

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
let lastSpawnEnv: Record<string, string> | undefined;

function mockSpawnWithCapture(result: MockSpawnResult): void {
  const _spawnMock = mock(
    (
      cmd: string[],
      options?: { cwd?: string; env?: Record<string, string> }
    ) => {
      lastSpawnCmd = cmd;
      lastSpawnEnv = options?.env;
      return result;
    }
  );
  (Bun as unknown as Record<string, unknown>).spawn = _spawnMock;
}

function mockWhich(paths: Record<string, string | null>): void {
  (Bun as unknown as Record<string, unknown>).which = mock(
    (binary: string) => paths[binary] ?? null
  );
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  lastSpawnCmd = [];
  lastSpawnEnv = undefined;
  // Default: docker is on PATH, compose is reachable.
  mockWhich({ docker: "/usr/bin/docker" });
});

afterEach(() => {
  (Bun as unknown as Record<string, unknown>).spawn = realSpawn;
  (Bun as unknown as Record<string, unknown>).which = realWhich;
  mock.restore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DockerService", () => {
  // -- Constructor ----------------------------------------------------------

  it("defaults cwd to process.cwd()", () => {
    const service = new DockerService();
    expect(service).toBeDefined();
  });

  it("accepts a custom cwd", () => {
    const service = new DockerService("/custom/path");
    expect(service).toBeDefined();
  });

  // -- checkAvailability ----------------------------------------------------

  describe("checkAvailability", () => {
    it("returns both true when docker and compose are available", async () => {
      // The new implementation uses Bun.which (no subprocess) for the binary
      // check, then spawns `docker compose version` to probe the subcommand.
      mockSpawnWithCapture(successSpawn("Docker Compose version v2.27.0"));

      const service = new DockerService();
      const result = await service.checkAvailability();

      expect(result.docker).toBe(true);
      expect(result.compose).toBe(true);
      // `docker compose version` should have been spawned exactly once.
      expect(lastSpawnCmd).toEqual(["docker", "compose", "version"]);
    });

    it("returns docker: false, compose: false when docker is not on PATH", async () => {
      mockWhich({ docker: null });

      const service = new DockerService();
      const result = await service.checkAvailability();

      expect(result.docker).toBe(false);
      expect(result.compose).toBe(false);
    });

    it("returns docker: true, compose: false when only docker binary exists", async () => {
      // Binary exists (which returns a path) but `docker compose version` fails.
      mockWhich({ docker: "/usr/bin/docker" });
      mockSpawnWithCapture(
        errorSpawn("docker: 'compose' is not a docker command", 1)
      );

      const service = new DockerService();
      const result = await service.checkAvailability();

      expect(result.docker).toBe(true);
      expect(result.compose).toBe(false);
    });

    it("returns both false when Bun.spawn throws in subcommand probe", async () => {
      const spawnMock = mock(() => {
        throw new Error("ENOENT: binary not found");
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new DockerService();
      const result = await service.checkAvailability();

      // docker binary is on PATH (mocked in beforeEach), but spawn threw,
      // so the subcommand probe returns false.
      expect(result.docker).toBe(true);
      expect(result.compose).toBe(false);
    });
  });

  // -- composeFileExists ----------------------------------------------------

  describe("composeFileExists", () => {
    it("returns true when docker-compose.yml exists", async () => {
      const mockFile = {
        exists: mock(() => Promise.resolve(true)),
      };
      const realFile = Bun.file;
      (Bun as unknown as Record<string, unknown>).file = mock(() => mockFile);

      const service = new DockerService("/project");
      const result = await service.composeFileExists();

      expect(result).toBe(true);
      expect(mockFile.exists).toHaveBeenCalled();

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("returns false when docker-compose.yml does not exist", async () => {
      const mockFile = {
        exists: mock(() => Promise.resolve(false)),
      };
      const realFile = Bun.file;
      (Bun as unknown as Record<string, unknown>).file = mock(() => mockFile);

      const service = new DockerService("/project");
      const result = await service.composeFileExists();

      expect(result).toBe(false);

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("handles cwd with trailing slash", async () => {
      const mockFile = {
        exists: mock(() => Promise.resolve(true)),
      };
      const realFile = Bun.file;
      const fileMock = mock((path: string) => {
        expect(path).toBe("/project/docker-compose.yml");
        return mockFile;
      });
      (Bun as unknown as Record<string, unknown>).file = fileMock;

      const service = new DockerService("/project/");
      const result = await service.composeFileExists();

      expect(result).toBe(true);

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });
  });

  // -- composeUp ------------------------------------------------------------

  describe("composeUp", () => {
    it("returns ok on successful non-detached compose up", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 0));

      const service = new DockerService("/project");
      const result = await service.composeUp(["workers", "dashboard"]);

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["docker", "compose", "up"]);
      // env inherits process.env (so PATH etc. survive) AND adds
      // COMPOSE_PROFILES — only assert the keys we set, not the whole env.
      expect(lastSpawnEnv?.COMPOSE_PROFILES).toBe("workers,dashboard");
    });

    it("inherits process.env (PATH etc.) so docker can find its daemon", async () => {
      // Regression test for the env-clobber bug: Bun.spawn's `env` REPLACES
      // (not merges) the parent environment. If we passed only
      // `{ COMPOSE_PROFILES: ... }`, the spawned `docker` would have no
      // PATH and fail with "command not found".
      process.env.HOOX_TEST_VAR = "preserved-for-child";
      try {
        mockSpawnWithCapture(makeSpawnResult("", "", 0));
        const service = new DockerService("/project");
        await service.composeUp(["workers"]);

        expect(lastSpawnEnv?.HOOX_TEST_VAR).toBe("preserved-for-child");
        expect(lastSpawnEnv?.COMPOSE_PROFILES).toBe("workers");
      } finally {
        delete process.env.HOOX_TEST_VAR;
      }
    });

    it("uses stdin: 'ignore' (not stdin: 'pipe') on the spawned process", async () => {
      let capturedStdin: unknown;
      const spawnMock = mock(
        (_cmd: string[], options?: { stdin?: unknown }) => {
          capturedStdin = options?.stdin;
          return makeSpawnResult("", "", 0);
        }
      );
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new DockerService("/project");
      await service.composeUp(["workers"]);

      expect(capturedStdin).toBe("ignore");
    });

    it("returns error on non-zero exit in non-detached mode", async () => {
      mockSpawnWithCapture(errorSpawn("container crashed", 1));

      const service = new DockerService("/project");
      const result = await service.composeUp(["workers"]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("exited with code 1");
      }
    });

    it("passes -d flag in detached mode", async () => {
      const stdoutText = "Starting containers...";
      mockSpawnWithCapture(makeSpawnResult(stdoutText, "", 0));

      const service = new DockerService("/project");
      const result = await service.composeUp(["workers"], true);

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toContain("-d");
    });

    it("returns error from stdout in detached mode on failure", async () => {
      mockSpawnWithCapture(makeSpawnResult("Error: port in use", "", 1));

      const service = new DockerService("/project");
      const result = await service.composeUp(["workers"], true);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Error: port in use");
      }
    });

    it("falls back to exit code message when stdout is empty in detached mode", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 1));

      const service = new DockerService("/project");
      const result = await service.composeUp(["workers"], true);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("exited with code 1");
      }
    });

    it("returns error when Bun.spawn throws", async () => {
      const spawnMock = mock(() => {
        throw new Error("docker not found");
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new DockerService("/project");
      const result = await service.composeUp(["workers"]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Failed to run docker compose");
        expect(result.error).toContain("docker not found");
      }
    });

    it("returns timeout error when proc.exited never resolves", async () => {
      // Simulate a hung process: exited promise never resolves.
      const hungProc: MockSpawnResult = {
        stdout: new Blob([""]),
        stderr: new Blob([""]),
        exited: new Promise<number>(() => {}), // never resolves
        kill: mock(() => {}),
      };
      (Bun as unknown as Record<string, unknown>).spawn = mock(() => hungProc);

      // Tiny timeout so the test finishes well under the 5s bun:test default.
      const service = new DockerService({ cwd: "/project", procTimeoutMs: 50 });
      const result = await service.composeUp(["workers"]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/timed out/);
      }
      // The hung process should have been killed.
      expect(hungProc.kill).toHaveBeenCalled();
    });
  });

  // -- composeDown ----------------------------------------------------------

  describe("composeDown", () => {
    it("returns ok on successful compose down", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 0));

      const service = new DockerService("/project");
      const result = await service.composeDown();

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["docker", "compose", "down"]);
    });

    it("uses stdin: 'ignore' (not stdin: 'pipe') on the spawned process", async () => {
      let capturedStdin: unknown;
      const spawnMock = mock(
        (_cmd: string[], options?: { stdin?: unknown }) => {
          capturedStdin = options?.stdin;
          return makeSpawnResult("", "", 0);
        }
      );
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new DockerService("/project");
      await service.composeDown();

      expect(capturedStdin).toBe("ignore");
    });

    it("returns error on non-zero exit", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "no containers to stop", 1));

      const service = new DockerService("/project");
      const result = await service.composeDown();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("no containers to stop");
      }
    });

    it("falls back to exit code message when stderr is empty", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 1));

      const service = new DockerService("/project");
      const result = await service.composeDown();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("exited with code 1");
      }
    });

    it("returns error when Bun.spawn throws", async () => {
      const spawnMock = mock(() => {
        throw new Error("docker not found");
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new DockerService("/project");
      const result = await service.composeDown();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Failed to run docker compose down");
      }
    });

    it("returns timeout error when proc.exited never resolves", async () => {
      const hungProc: MockSpawnResult = {
        stdout: new Blob([""]),
        stderr: new Blob([""]),
        exited: new Promise<number>(() => {}),
        kill: mock(() => {}),
      };
      (Bun as unknown as Record<string, unknown>).spawn = mock(() => hungProc);

      const service = new DockerService({ cwd: "/project", procTimeoutMs: 50 });
      const result = await service.composeDown();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/timed out/);
      }
      expect(hungProc.kill).toHaveBeenCalled();
    });
  });
});
