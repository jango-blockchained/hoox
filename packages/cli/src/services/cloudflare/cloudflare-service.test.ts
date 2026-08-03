/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { CloudflareService } from "./cloudflare-service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save a reference to the real Bun.spawn so we can restore it after tests. */
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

/**
 * Creates a mock spawn result with the given stdout, stderr, and exit code.
 * Used to replace Bun.spawn in tests.
 */
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

/**
 * Convenience: a successful spawn with the given stdout.
 */
function successSpawn(stdout: string): MockSpawnResult {
  return makeSpawnResult(stdout, "", 0);
}

/**
 * Convenience: a failed spawn with the given stderr and exit code.
 */
function errorSpawn(stderr: string, exitCode = 1): MockSpawnResult {
  return makeSpawnResult("", stderr, exitCode);
}

/** Track spawn calls so we can assert on arguments. */
let lastSpawnCmd: string[] = [];
/** Track the cwd option passed to spawn (for home directory tests). */
let lastSpawnCwd: string | undefined;

function mockSpawnWithCapture(result: MockSpawnResult): void {
  const _spawnMock = mock((cmd: string[], options?: { cwd?: string }) => {
    lastSpawnCmd = cmd;
    lastSpawnCwd = options?.cwd;
    return result;
  });
  (Bun as unknown as Record<string, unknown>).spawn = _spawnMock;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  lastSpawnCmd = [];
  lastSpawnCwd = undefined;
});

afterEach(() => {
  (Bun as unknown as Record<string, unknown>).spawn = realSpawn;
  mock.restore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CloudflareService", () => {
  // -- Constructor ----------------------------------------------------------

  it("defaults cwd to process.cwd()", () => {
    const service = new CloudflareService();
    // Cannot easily inspect private cwd, but we verify via spawn cwd later
    expect(service).toBeDefined();
  });

  it("accepts a custom cwd", () => {
    const service = new CloudflareService("/custom/path");
    expect(service).toBeDefined();
  });

  it("accepts an optional homeDir for home directory resolution", () => {
    const service = new CloudflareService(undefined, "/home/user");
    expect(service).toBeDefined();
  });

  it("accepts cwd, homeDir, and configService together", () => {
    const service = new CloudflareService("/custom/path", "/home/user");
    expect(service).toBeDefined();
  });

  // -- Home directory resolution -------------------------------------------

  describe("home directory resolution", () => {
    it("resolves deploy workerPath via homeDir", async () => {
      const stdout =
        "Published test-worker (0.5 sec)\n  https://test-worker.cryptolinx.workers.dev";
      mockSpawnWithCapture(successSpawn(stdout));

      const service = new CloudflareService(undefined, "/home/testuser");
      const result = await service.deploy("workers/hoox-worker");

      expect(result.ok).toBe(true);
      // Spawn should use the home-dir resolved path as cwd
      expect(lastSpawnCwd).toBe("/home/testuser/.hoox/workers/hoox-worker");
    });

    it("resolves dev workerPath via homeDir", async () => {
      mockSpawnWithCapture(successSpawn(""));

      const service = new CloudflareService(undefined, "/home/testuser");
      await service.dev("workers/hoox-worker");

      // Spawn should use the home-dir resolved path as cwd
      expect(lastSpawnCwd).toBe("/home/testuser/.hoox/workers/hoox-worker");
    });

    it("falls back to cwd resolution when no homeDir is provided", async () => {
      const stdout =
        "Published test-worker\n  https://test-worker.cryptolinx.workers.dev";
      mockSpawnWithCapture(successSpawn(stdout));

      const service = new CloudflareService("/original/cwd");
      const result = await service.deploy("workers/hoox-worker");

      expect(result.ok).toBe(true);
      expect(lastSpawnCwd).toBe("/original/cwd/workers/hoox-worker");
    });

    it("extracts worker name from path in deploy result when using homeDir", async () => {
      const stdout =
        "Published hoox (0.5 sec)\n  https://hoox.cryptolinx.workers.dev";
      mockSpawnWithCapture(successSpawn(stdout));

      const service = new CloudflareService(undefined, "/home/testuser");
      const result = await service.deploy("workers/hoox-worker");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("hoox");
      }
    });
  });

  // -- whoami ---------------------------------------------------------------

  describe("whoami", () => {
    it("returns ok with stdout on success", async () => {
      mockSpawnWithCapture(successSpawn("user@example.com"));

      const service = new CloudflareService();
      const result = await service.whoami();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("user@example.com");
      }
      expect(lastSpawnCmd).toEqual(["wrangler", "whoami"]);
    });

    it("returns error on non-zero exit", async () => {
      mockSpawnWithCapture(errorSpawn("Not authenticated"));

      const service = new CloudflareService();
      const result = await service.whoami();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Not authenticated");
      }
    });
  });

  // -- deploy ---------------------------------------------------------------

  describe("deploy", () => {
    it("deploys without --env by default", async () => {
      const stdout =
        "Published test-worker (0.5 sec)\n  https://test-worker.cryptolinx.workers.dev";
      mockSpawnWithCapture(successSpawn(stdout));

      const service = new CloudflareService();
      const result = await service.deploy("workers/test-worker");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe(
          "https://test-worker.cryptolinx.workers.dev"
        );
      }
      expect(lastSpawnCmd).toEqual(["wrangler", "deploy"]);
    });

    it("includes --env when specified", async () => {
      const stdout =
        "Published test-worker (production)\n  https://test-worker.cryptolinx.workers.dev";
      mockSpawnWithCapture(successSpawn(stdout));

      const service = new CloudflareService();
      const result = await service.deploy("workers/test-worker", "production");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe(
          "https://test-worker.cryptolinx.workers.dev"
        );
      }
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "deploy",
        "--env",
        "production",
      ]);
    });

    it("returns url undefined when stdout has no URL", async () => {
      mockSpawnWithCapture(successSpawn("Deployed successfully. No URL here."));

      const service = new CloudflareService();
      const result = await service.deploy("workers/test-worker");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBeUndefined();
      }
    });

    it("returns error on deploy failure", async () => {
      mockSpawnWithCapture(errorSpawn("Authentication error"));

      const service = new CloudflareService();
      const result = await service.deploy("workers/broken");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Authentication error");
      }
    });
  });

  // -- dev ------------------------------------------------------------------

  describe("dev", () => {
    it("returns default port 8787", async () => {
      mockSpawnWithCapture(successSpawn(""));

      const service = new CloudflareService();
      const result = await service.dev("workers/test-worker");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.port).toBe(8787);
      }
      expect(lastSpawnCmd).toEqual(["wrangler", "dev", "--port", "8787"]);
    });

    it("returns custom port when specified", async () => {
      mockSpawnWithCapture(successSpawn(""));

      const service = new CloudflareService();
      const result = await service.dev("workers/test-worker", 3000);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.port).toBe(3000);
      }
      expect(lastSpawnCmd).toEqual(["wrangler", "dev", "--port", "3000"]);
    });
  });

  // -- D1 -------------------------------------------------------------------

  describe("d1 operations", () => {
    it("d1List calls wrangler d1 list --json", async () => {
      mockSpawnWithCapture(successSpawn('[{"name":"test-db"}]'));

      const service = new CloudflareService();
      const result = await service.d1List();

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["wrangler", "d1", "list", "--json"]);
    });

    it("d1Create calls wrangler d1 create with name", async () => {
      mockSpawnWithCapture(successSpawn("Created database my-db"));

      const service = new CloudflareService();
      const result = await service.d1Create("my-db");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["wrangler", "d1", "create", "my-db"]);
    });

    it("d1Delete calls wrangler d1 delete with name", async () => {
      mockSpawnWithCapture(successSpawn("Deleted database old-db"));

      const service = new CloudflareService();
      const result = await service.d1Delete("old-db");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["wrangler", "d1", "delete", "old-db"]);
    });

    it("d1Execute calls wrangler d1 execute with --command and extracts the JSON array (regression: noisy wrangler stdout)", async () => {
      // wrangler d1 execute writes a noisy prefix to stdout before
      // the JSON array. The previous implementation returned the
      // full stdout, which the caller (check setup) then failed to
      // JSON.parse line-by-line, reporting all tables as missing.
      const noisyStdout =
        "⛅️ wrangler 4.98.0 (update available 4.105.0)\n" +
        "──────────────────────────────────────────────\n" +
        "Resource location: remote\n" +
        "\n" +
        "There is a newer version of Wrangler available (current: 4.98.0, latest: 4.105.0).\n" +
        "🌀 Executing on remote database trade-data-db (a682f084-...):\n" +
        "🚣 Executed 1 command in 0.22ms\n" +
        JSON.stringify([
          { name: "trade_signals" },
          { name: "trades" },
          { name: "positions" },
        ]);
      mockSpawnWithCapture(successSpawn(noisyStdout));

      const service = new CloudflareService();
      const result = await service.d1Execute(
        "trade-data-db",
        "SELECT name FROM sqlite_master WHERE type='table'",
        true
      );

      if (!result.ok) {
        throw new Error(
          `expected result.ok to be true, got error: ${result.error}`
        );
      }
      // The result is the pure JSON array.
      const parsed = JSON.parse(result.value);
      expect(parsed).toEqual([
        { name: "trade_signals" },
        { name: "trades" },
        { name: "positions" },
      ]);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "d1",
        "execute",
        "trade-data-db",
        "--command",
        "SELECT name FROM sqlite_master WHERE type='table'",
        "--remote",
      ]);
    });

    it("d1Execute returns an error when stdout has no JSON array", async () => {
      mockSpawnWithCapture(
        successSpawn("Error: database not found (some non-JSON text)")
      );

      const service = new CloudflareService();
      const result = await service.d1Execute("missing-db", "SELECT 1", true);

      if (result.ok) {
        throw new Error("expected result.ok to be false");
      }
      expect(result.error).toContain("non-JSON");
    });
  });

  // -- KV -------------------------------------------------------------------

  describe("kv operations", () => {
    it("kvList calls wrangler kv namespace list", async () => {
      mockSpawnWithCapture(successSpawn("[]"));

      const service = new CloudflareService();
      const result = await service.kvList();

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["wrangler", "kv", "namespace", "list"]);
    });

    it("kvCreate calls wrangler kv namespace create", async () => {
      mockSpawnWithCapture(successSpawn("Created namespace my-kv"));

      const service = new CloudflareService();
      const result = await service.kvCreate("my-kv");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "kv",
        "namespace",
        "create",
        "my-kv",
      ]);
    });

    it("kvDelete calls wrangler kv namespace delete", async () => {
      mockSpawnWithCapture(successSpawn("Deleted namespace"));

      const service = new CloudflareService();
      const result = await service.kvDelete("abc123");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "kv",
        "namespace",
        "delete",
        "--namespace-id",
        "abc123",
      ]);
    });
  });

  // -- R2 -------------------------------------------------------------------

  describe("r2 operations", () => {
    it("r2List calls wrangler r2 bucket list", async () => {
      mockSpawnWithCapture(successSpawn("[]"));

      const service = new CloudflareService();
      const result = await service.r2List();

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["wrangler", "r2", "bucket", "list"]);
    });

    it("r2Create calls wrangler r2 bucket create", async () => {
      mockSpawnWithCapture(successSpawn("Created bucket my-bucket"));

      const service = new CloudflareService();
      const result = await service.r2Create("my-bucket");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "r2",
        "bucket",
        "create",
        "my-bucket",
      ]);
    });

    it("r2Delete calls wrangler r2 bucket delete", async () => {
      mockSpawnWithCapture(successSpawn("Deleted bucket"));

      const service = new CloudflareService();
      const result = await service.r2Delete("old-bucket");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "r2",
        "bucket",
        "delete",
        "old-bucket",
      ]);
    });
  });

  // -- Queues ---------------------------------------------------------------

  describe("queue operations", () => {
    it("queueList calls wrangler queues list", async () => {
      mockSpawnWithCapture(successSpawn("[]"));

      const service = new CloudflareService();
      const result = await service.queueList();

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["wrangler", "queues", "list"]);
    });

    it("queueCreate calls wrangler queues create", async () => {
      mockSpawnWithCapture(successSpawn("Created queue my-queue"));

      const service = new CloudflareService();
      const result = await service.queueCreate("my-queue");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "queues",
        "create",
        "my-queue",
      ]);
    });

    it("queueDelete calls wrangler queues delete", async () => {
      mockSpawnWithCapture(successSpawn("Deleted queue"));

      const service = new CloudflareService();
      const result = await service.queueDelete("old-queue");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "queues",
        "delete",
        "old-queue",
      ]);
    });
  });

  // -- Vectorize ------------------------------------------------------------

  describe("vectorize operations", () => {
    it("vectorizeList calls wrangler vectorize list --json", async () => {
      mockSpawnWithCapture(successSpawn("[]"));

      const service = new CloudflareService();
      const result = await service.vectorizeList();

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual(["wrangler", "vectorize", "list", "--json"]);
    });

    it("vectorizeCreate calls wrangler vectorize create with defaults", async () => {
      mockSpawnWithCapture(successSpawn("Created index my-index"));

      const service = new CloudflareService();
      const result = await service.vectorizeCreate("my-index");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "vectorize",
        "create",
        "my-index",
        "--dimensions",
        "768",
        "--metric",
        "cosine",
      ]);
    });

    it("vectorizeCreate passes custom dimensions and metric", async () => {
      mockSpawnWithCapture(successSpawn("Created index my-index"));

      const service = new CloudflareService();
      const result = await service.vectorizeCreate(
        "my-index",
        384,
        "euclidean"
      );

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "vectorize",
        "create",
        "my-index",
        "--dimensions",
        "384",
        "--metric",
        "euclidean",
      ]);
    });

    it("vectorizeDelete calls wrangler vectorize delete", async () => {
      mockSpawnWithCapture(successSpawn("Deleted index"));

      const service = new CloudflareService();
      const result = await service.vectorizeDelete("old-index");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "vectorize",
        "delete",
        "old-index",
      ]);
    });
  });

  // -- Analytics ------------------------------------------------------------

  describe("analytics operations", () => {
    it("analyticsList calls wrangler analytics dataset list", async () => {
      mockSpawnWithCapture(successSpawn("[]"));

      const service = new CloudflareService();
      const result = await service.analyticsList();

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "analytics",
        "dataset",
        "list",
      ]);
    });

    it("analyticsCreate returns error with Dashboard URL instructions", async () => {
      const service = new CloudflareService();
      const result = await service.analyticsCreate("my-dataset");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("cannot be created via wrangler");
        expect(result.error).toContain("dash.cloudflare.com");
      }
    });
  });

  // -- Secrets --------------------------------------------------------------

  describe("secret operations", () => {
    it("secretList calls wrangler secret list --name", async () => {
      mockSpawnWithCapture(successSpawn("[]"));

      const service = new CloudflareService();
      const result = await service.secretList("my-worker");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "secret",
        "list",
        "--name",
        "my-worker",
      ]);
    });

    it("secretList extracts the JSON array from wrangler's mixed stdout (regression: 'There is a newer version of Wrangler available' notice)", async () => {
      // As of wrangler 4.98, `wrangler secret list` writes a version
      // upgrade notice to stdout BEFORE the JSON array. The previous
      // implementation tried to JSON.parse the whole stdout and
      // failed silently, causing `hoox setup` to report all secrets
      // as missing despite the SET step having succeeded.
      const noisyStdout =
        "There is a newer version of Wrangler available (current: 4.98.0, latest: 4.105.0). Try upgrading, as it might support this configuration option.\n" +
        JSON.stringify([
          { name: "INTERNAL_KEY_BINDING", type: "secret_text" },
          { name: "AGENT_INTERNAL_KEY", type: "secret_text" },
        ]);
      mockSpawnWithCapture(successSpawn(noisyStdout));

      const service = new CloudflareService();
      const result = await service.secretList("agent-worker");

      if (!result.ok) {
        throw new Error(
          `expected result.ok to be true, got error: ${result.error}`
        );
      }
      // The result must be the pure JSON array, not the noisy prefix.
      expect(result.value).toBe(
        JSON.stringify([
          { name: "INTERNAL_KEY_BINDING", type: "secret_text" },
          { name: "AGENT_INTERNAL_KEY", type: "secret_text" },
        ])
      );
      // And it must be parseable (this is what the caller does).
      const parsed = JSON.parse(result.value);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.map((s: { name: string }) => s.name)).toEqual([
        "INTERNAL_KEY_BINDING",
        "AGENT_INTERNAL_KEY",
      ]);
    });

    it("secretList returns an error when stdout has no JSON array", async () => {
      mockSpawnWithCapture(
        successSpawn("No secrets found. (some non-JSON text)")
      );

      const service = new CloudflareService();
      const result = await service.secretList("d1-worker");

      // Type narrowing: assert in one expression so TS sees the
      // discriminated union properly.
      if (result.ok) {
        throw new Error("expected result.ok to be false");
      }
      expect(result.error).toContain("non-JSON");
    });

    it("secretList handles nested brackets inside string literals (extractJsonArray)", async () => {
      // The JSON array contains an object whose string value has
      // a closing bracket. The extractor must not be fooled into
      // returning early.
      const stdout =
        "prefix noise\n" +
        JSON.stringify([{ name: "WEIRD_KEY", type: "secret_text" }]) +
        "\nsuffix noise";
      mockSpawnWithCapture(successSpawn(stdout));

      const service = new CloudflareService();
      const result = await service.secretList("my-worker");

      if (!result.ok) {
        throw new Error(
          `expected result.ok to be true, got error: ${result.error}`
        );
      }
      const parsed = JSON.parse(result.value);
      expect(parsed[0].name).toBe("WEIRD_KEY");
    });

    it("secretPut pipes value through stdin (never via CLI args)", async () => {
      let stdinWritten = "";
      let stdinEnded = false;

      const spawnResult = {
        stdout: new Blob(["Secret set successfully"]),
        stderr: new Blob([""]),
        exited: Promise.resolve(0),
        stdin: {
          write: mock((data: string) => {
            stdinWritten = data;
          }),
          end: mock(() => {
            stdinEnded = true;
          }),
        },
        kill: mock(() => {}),
      };

      const spawnMock = mock((cmd: string[]) => {
        lastSpawnCmd = cmd;
        return spawnResult;
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new CloudflareService();
      const result = await service.secretPut(
        "my-worker",
        "API_KEY",
        "super-secret-value"
      );

      expect(result.ok).toBe(true);
      // The secret value should NEVER appear in CLI args
      const argsJoined = lastSpawnCmd.join(" ");
      expect(argsJoined).not.toContain("super-secret-value");
      // stdin should receive the secret value
      expect(stdinWritten).toBe("super-secret-value\n");
      expect(stdinEnded).toBe(true);
    });

    it("secretDelete calls wrangler secret delete", async () => {
      mockSpawnWithCapture(successSpawn("Deleted secret"));

      const service = new CloudflareService();
      const result = await service.secretDelete("my-worker", "OLD_KEY");

      expect(result.ok).toBe(true);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "secret",
        "delete",
        "OLD_KEY",
        "--name",
        "my-worker",
      ]);
    });
  });

  // -- zonesList ------------------------------------------------------------

  describe("zonesList", () => {
    const originalFetch = globalThis.fetch;
    const originalToken = process.env.CLOUDFLARE_API_TOKEN;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (originalToken !== undefined) {
        process.env.CLOUDFLARE_API_TOKEN = originalToken;
      } else {
        delete process.env.CLOUDFLARE_API_TOKEN;
      }
    });

    it("calls Cloudflare API for zones", async () => {
      process.env.CLOUDFLARE_API_TOKEN = "test-token";
      globalThis.fetch = mock(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              result: [
                { id: "zone-id-1", name: "example.com" },
                { id: "zone-id-2", name: "test.com" },
              ],
              errors: [],
            }),
            { status: 200 }
          )
      ) as unknown as typeof fetch;

      const service = new CloudflareService();
      const result = await service.zonesList();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("example.com (zone-id-1)");
        expect(result.value).toContain("test.com (zone-id-2)");
      }
    });

    it("returns error when CLOUDFLARE_API_TOKEN is not set", async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;

      const service = new CloudflareService();
      const result = await service.zonesList();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("CLOUDFLARE_API_TOKEN");
      }
    });

    it("returns error when API call fails", async () => {
      process.env.CLOUDFLARE_API_TOKEN = "test-token";
      globalThis.fetch = mock(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              result: [],
              errors: [{ message: "Unauthorized" }],
            }),
            { status: 401 }
          )
      ) as unknown as typeof fetch;

      const service = new CloudflareService();
      const result = await service.zonesList();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unauthorized");
      }
    });
  });

  // -- Error handling -------------------------------------------------------

  describe("error handling", () => {
    it("returns ok:false when wrangler exits non-zero", async () => {
      mockSpawnWithCapture(errorSpawn("fatal error: something broke", 2));

      const service = new CloudflareService();
      const result = await service.whoami();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("fatal error: something broke");
      }
    });

    it("falls back to exit code message when stderr is empty", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 1));

      const service = new CloudflareService();
      const result = await service.whoami();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("wrangler exited with code 1");
      }
    });

    it("returns error when Bun.spawn itself throws", async () => {
      // Simulate spawn throwing (e.g. wrangler not installed)
      const spawnMock = mock(() => {
        throw new Error("ENOENT: wrangler not found");
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new CloudflareService();
      const result = await service.whoami();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Failed to spawn wrangler");
        expect(result.error).toContain("ENOENT");
        expect(result.error).toContain("↳ hint:");
        expect(result.error).toContain("bun add -g wrangler");
      }
    });

    it("returns plain error when spawn throws with non-ENOENT message", async () => {
      // Simulate a non-ENOENT spawn failure (e.g. permission denied).
      // No hint should be added in that case.
      const spawnMock = mock(() => {
        throw new Error("EACCES: permission denied");
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new CloudflareService();
      const result = await service.whoami();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Failed to spawn wrangler");
        expect(result.error).not.toContain("↳ hint:");
      }
    });
  });

  // -- Stdout parsing -------------------------------------------------------

  describe("stdout parsing", () => {
    it("trims trailing whitespace from stdout", async () => {
      mockSpawnWithCapture(successSpawn("  hello world  \n"));

      const service = new CloudflareService();
      const result = await service.whoami();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("hello world");
      }
    });
  });
});
