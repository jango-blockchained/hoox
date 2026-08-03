/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { DbService } from "./db-service.js";
import type { ConfigService } from "../config/config-service.js";

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

/** Create a mock ConfigService for injection. */
function createMockConfigService(
  overrides: Partial<ConfigService> = {}
): ConfigService {
  return {
    load: mock(() => Promise.resolve({} as never)),
    getWorker: mock(() => undefined),
    ...overrides,
  } as unknown as ConfigService;
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

describe("DbService", () => {
  // -- resolveWranglerConfigPath --------------------------------------------

  describe("resolveWranglerConfigPath", () => {
    it("returns explicit constructor override", () => {
      const service = new DbService(
        undefined,
        undefined,
        "/tmp/custom-wrangler.jsonc"
      );
      expect(service.resolveWranglerConfigPath()).toBe(
        "/tmp/custom-wrangler.jsonc"
      );
    });
  });

  // -- resolveDbName --------------------------------------------------------

  describe("resolveDbName", () => {
    it("returns the provided dbName directly", async () => {
      const configMock = createMockConfigService();
      const service = new DbService(configMock);

      const result = await service.resolveDbName("my-custom-db");

      expect(result).toBe("my-custom-db");
    });

    it("reads database_name from config when no flag provided", async () => {
      const configMock = createMockConfigService({
        load: mock(() => Promise.resolve({} as never)),
        getWorker: mock(() => ({
          vars: { database_name: "hoox-db" },
        })) as never,
      });
      const service = new DbService(configMock);

      const result = await service.resolveDbName();

      expect(result).toBe("hoox-db");
      expect(configMock.load).toHaveBeenCalled();
      expect(configMock.getWorker).toHaveBeenCalledWith("d1-worker");
    });

    it("falls back to my-database when config has no database_name", async () => {
      const configMock = createMockConfigService({
        load: mock(() => Promise.resolve({} as never)),
        getWorker: mock(() => ({ vars: {} })) as never,
      });
      const service = new DbService(configMock);

      const result = await service.resolveDbName();

      expect(result).toBe("my-database");
    });

    it("falls back to my-database when config load throws", async () => {
      const configMock = createMockConfigService({
        load: mock(() => Promise.reject(new Error("config not found"))),
      });
      const service = new DbService(configMock);

      const result = await service.resolveDbName();

      expect(result).toBe("my-database");
    });

    it("falls back to my-database when getWorker returns undefined", async () => {
      const configMock = createMockConfigService({
        load: mock(() => Promise.resolve({} as never)),
        getWorker: mock(() => undefined),
      });
      const service = new DbService(configMock);

      const result = await service.resolveDbName();

      expect(result).toBe("my-database");
    });
  });

  // -- Constructor ----------------------------------------------------------

  describe("constructor", () => {
    it("accepts optional homeDir parameter", () => {
      const service = new DbService(undefined, "/home/testuser");
      expect(service).toBeDefined();
    });

    it("accepts configService and homeDir together", () => {
      const configMock = createMockConfigService();
      const service = new DbService(configMock, "/home/testuser");
      expect(service).toBeDefined();
    });
  });

  // -- Home directory resolution --------------------------------------------

  describe("home directory resolution", () => {
    it("resolves default schema path via homeDir in apply()", async () => {
      mockSpawnWithCapture(successSpawn("Executed SQL successfully"));

      const service = new DbService(undefined, "/home/testuser");
      const result = await service.apply("hoox-db", false);

      expect(result).toBe("Executed SQL successfully");
      // Should use home-dir resolved path for schema file
      const fileIndex = lastSpawnCmd.indexOf("--file");
      expect(lastSpawnCmd[fileIndex + 1]).toBe(
        "/home/testuser/.hoox/workers/trade-worker/schema.sql"
      );
    });

    it("uses provided schemaPath even when homeDir is set", async () => {
      mockSpawnWithCapture(successSpawn("Executed"));

      const service = new DbService(undefined, "/home/testuser");
      await service.apply("hoox-db", false, "custom/schema.sql");

      const fileIndex = lastSpawnCmd.indexOf("--file");
      expect(lastSpawnCmd[fileIndex + 1]).toBe("custom/schema.sql");
    });

    it("reads migration script from homeDir when configured", async () => {
      const mockFile = {
        exists: mock(() => Promise.resolve(true)),
        text: mock(() =>
          Promise.resolve(
            "d1 execute hoox-db --command='CREATE TABLE test (id INT)'"
          )
        ),
      };
      const realFile = Bun.file;
      const bunFileMock = mock((path: string) => {
        // Verify the resolved path includes homeDir
        expect(path).toBe("/home/testuser/.hoox/scripts/migrate-tracking.sh");
        return mockFile;
      });
      (Bun as unknown as Record<string, unknown>).file = bunFileMock;

      mockSpawnWithCapture(successSpawn("Migration applied"));

      const service = new DbService(undefined, "/home/testuser");
      const result = await service.migrate("hoox-db", false);

      expect(result).toBe("Migration applied");
      expect(lastSpawnCmd).toContain("CREATE TABLE test (id INT)");
      // Verify Bun.file was called (the assertion runs inside the mock)
      expect(bunFileMock).toHaveBeenCalled();

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("falls back to relative schema path when no homeDir", async () => {
      mockSpawnWithCapture(successSpawn("Executed"));

      const service = new DbService();
      await service.apply("hoox-db", false);

      const fileIndex = lastSpawnCmd.indexOf("--file");
      expect(lastSpawnCmd[fileIndex + 1]).toBe(
        "workers/trade-worker/schema.sql"
      );
    });
  });

  // -- apply ----------------------------------------------------------------

  describe("apply", () => {
    it("runs wrangler d1 execute with schema file", async () => {
      mockSpawnWithCapture(successSpawn("Executed SQL successfully"));

      const service = new DbService();
      const result = await service.apply("hoox-db", false);

      expect(result).toBe("Executed SQL successfully");
      expect(lastSpawnCmd.slice(0, 6)).toEqual([
        "wrangler",
        "d1",
        "execute",
        "hoox-db",
        "--file",
        "workers/trade-worker/schema.sql",
      ]);
    });

    it("includes --remote flag when remote is true", async () => {
      mockSpawnWithCapture(successSpawn("Executed on remote"));

      const service = new DbService();
      const result = await service.apply("hoox-db", true);

      expect(result).toBe("Executed on remote");
      expect(lastSpawnCmd).toContain("--remote");
    });

    it("accepts custom schema path", async () => {
      mockSpawnWithCapture(successSpawn("Executed"));

      const service = new DbService();
      await service.apply("hoox-db", false, "custom/schema.sql");

      const fileIndex = lastSpawnCmd.indexOf("--file");
      expect(lastSpawnCmd[fileIndex + 1]).toBe("custom/schema.sql");
    });

    it("throws on non-zero exit", async () => {
      mockSpawnWithCapture(errorSpawn("Database not found"));

      const service = new DbService();

      await expect(service.apply("bad-db", false)).rejects.toThrow(
        "Database not found"
      );
    });

    it("throws with fallback message when stderr is empty", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 1));

      const service = new DbService();

      await expect(service.apply("bad-db", false)).rejects.toThrow(
        "wrangler exited with code 1"
      );
    });
  });

  // -- migrate --------------------------------------------------------------

  describe("migrate", () => {
    it("runs wrangler d1 execute with migration SQL", async () => {
      // Mock readMigrationSql to return SQL
      const mockFile = {
        exists: mock(() => Promise.resolve(true)),
        text: mock(() =>
          Promise.resolve(
            "d1 execute hoox-db --command='CREATE TABLE test (id INT)'"
          )
        ),
      };
      const realFile = Bun.file;
      (Bun as unknown as Record<string, unknown>).file = mock(() => mockFile);

      mockSpawnWithCapture(successSpawn("Migration applied"));

      const service = new DbService();
      const result = await service.migrate("hoox-db", false);

      expect(result).toBe("Migration applied");
      expect(lastSpawnCmd).toContain("CREATE TABLE test (id INT)");

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("includes --remote flag when remote is true", async () => {
      const mockFile = {
        exists: mock(() => Promise.resolve(true)),
        text: mock(() =>
          Promise.resolve("d1 execute hoox-db --command='SELECT 1'")
        ),
      };
      const realFile = Bun.file;
      (Bun as unknown as Record<string, unknown>).file = mock(() => mockFile);

      mockSpawnWithCapture(successSpawn("Migration applied"));

      const service = new DbService();
      await service.migrate("hoox-db", true);

      expect(lastSpawnCmd).toContain("--remote");

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("throws when migration file is not found (no silent SELECT 1)", async () => {
      const mockFile = {
        exists: mock(() => Promise.resolve(false)),
        text: mock(() => Promise.resolve("")),
      };
      const realFile = Bun.file;
      (Bun as unknown as Record<string, unknown>).file = mock(() => mockFile);

      const service = new DbService();

      await expect(service.migrate("hoox-db", false)).rejects.toThrow(
        "not found"
      );

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("throws when migration file has no matching command (no silent SELECT 1)", async () => {
      const mockFile = {
        exists: mock(() => Promise.resolve(true)),
        text: mock(() => Promise.resolve("echo hello")),
      };
      const realFile = Bun.file;
      (Bun as unknown as Record<string, unknown>).file = mock(() => mockFile);

      const service = new DbService();

      await expect(service.migrate("hoox-db", false)).rejects.toThrow(
        "no `d1 execute"
      );

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("throws when Bun.file throws (no silent SELECT 1)", async () => {
      const realFile = Bun.file;
      (Bun as unknown as Record<string, unknown>).file = mock(() => {
        throw new Error("file error");
      });

      const service = new DbService();

      await expect(service.migrate("hoox-db", false)).rejects.toThrow(
        "could not be read"
      );

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("throws on non-zero exit from wrangler", async () => {
      const mockFile = {
        exists: mock(() => Promise.resolve(true)),
        text: mock(() =>
          Promise.resolve(
            "d1 execute hoox-db --command='CREATE TABLE t (id INT)'"
          )
        ),
      };
      const realFile = Bun.file;
      (Bun as unknown as Record<string, unknown>).file = mock(() => mockFile);

      mockSpawnWithCapture(errorSpawn("Migration failed"));

      const service = new DbService();
      await expect(service.migrate("hoox-db", false)).rejects.toThrow(
        "Migration failed"
      );

      (Bun as unknown as Record<string, unknown>).file = realFile;
    });
  });

  // -- query ----------------------------------------------------------------

  describe("query", () => {
    it("runs wrangler d1 execute with SQL command", async () => {
      mockSpawnWithCapture(successSpawn('[{"results":[{"name":"test"}]}]'));

      const service = new DbService();
      const result = await service.query(
        "hoox-db",
        "SELECT * FROM sqlite_master",
        false
      );

      expect(result).toBe('[{"results":[{"name":"test"}]}]');
      expect(lastSpawnCmd.slice(0, 7)).toEqual([
        "wrangler",
        "d1",
        "execute",
        "hoox-db",
        "--command",
        "SELECT * FROM sqlite_master",
        "--json",
      ]);
    });

    it("includes --remote when remote is true", async () => {
      mockSpawnWithCapture(successSpawn("[]"));

      const service = new DbService();
      await service.query("hoox-db", "SELECT 1", true);

      expect(lastSpawnCmd).toContain("--remote");
    });

    it("passes -c when an explicit wrangler config path is provided", async () => {
      mockSpawnWithCapture(successSpawn("[]"));

      const service = new DbService(
        undefined,
        undefined,
        "workers/d1-worker/wrangler.jsonc"
      );
      await service.query("hoox-db", "SELECT 1", false);

      expect(lastSpawnCmd).toContain("-c");
      expect(lastSpawnCmd).toContain("workers/d1-worker/wrangler.jsonc");
    });
  });

  // -- export ---------------------------------------------------------------

  describe("export", () => {
    it("runs wrangler d1 export with default output path", async () => {
      mockSpawnWithCapture(successSpawn("Exported successfully"));

      // Mock Date for deterministic test
      const realDate = globalThis.Date;
      const mockDate = new Date("2026-06-02T12:00:00Z");
      globalThis.Date = class extends Date {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super();
            return mockDate;
          }
          super(...(args as [string | number | Date]));
        }
        toISOString() {
          return mockDate.toISOString();
        }
      } as unknown as typeof Date;

      const service = new DbService();
      const result = await service.export("hoox-db");

      expect(result).toBe("backup-2026-06-02.sql");

      globalThis.Date = realDate;
    });

    it("uses custom output path when provided", async () => {
      mockSpawnWithCapture(successSpawn("Exported"));

      const service = new DbService();
      const result = await service.export("hoox-db", "my-backup.sql");

      expect(result).toBe("my-backup.sql");
      expect(lastSpawnCmd.slice(0, 7)).toEqual([
        "wrangler",
        "d1",
        "export",
        "hoox-db",
        "--output",
        "my-backup.sql",
        "--remote",
      ]);
    });
  });

  // -- reset ----------------------------------------------------------------

  describe("reset", () => {
    it("deletes and recreates the database", async () => {
      const results = [
        successSpawn("Deleted database"),
        successSpawn("Created database hoox-db"),
      ];
      let index = 0;
      const spawnMock = mock((cmd: string[]) => {
        lastSpawnCmd = cmd;
        const r = results[index];
        if (r) index++;
        return r ?? errorSpawn("unexpected", 127);
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new DbService();
      const result = await service.reset("hoox-db");

      expect(result).toBe("Created database hoox-db");
    });

    it("throws when delete fails", async () => {
      mockSpawnWithCapture(errorSpawn("Cannot delete"));

      const service = new DbService();

      await expect(service.reset("hoox-db")).rejects.toThrow("Cannot delete");
    });
  });

  // -- parseTableNames (static) ---------------------------------------------

  describe("parseTableNames", () => {
    it("parses JSON response with results array", () => {
      const output = JSON.stringify([
        {
          results: [
            { name: "trades" },
            { name: "positions" },
            { name: "balances" },
          ],
        },
      ]);

      const result = DbService.parseTableNames(output);

      expect(result).toEqual(["trades", "positions", "balances"]);
    });

    it("handles empty results array", () => {
      const output = JSON.stringify([{ results: [] }]);

      const result = DbService.parseTableNames(output);

      expect(result).toEqual([]);
    });

    it("filters out empty names", () => {
      const output = JSON.stringify([
        {
          results: [{ name: "trades" }, { name: "" }, { name: "positions" }],
        },
      ]);

      const result = DbService.parseTableNames(output);

      expect(result).toEqual(["trades", "positions"]);
    });

    it("falls back to text parsing when JSON parse fails", () => {
      const output = "trades\npositions  \n\nbalances";

      const result = DbService.parseTableNames(output);

      expect(result).toEqual(["trades", "positions", "balances"]);
    });

    it("returns empty array for empty text output", () => {
      const result = DbService.parseTableNames("");

      expect(result).toEqual([]);
    });

    it("handles malformed JSON gracefully", () => {
      const result = DbService.parseTableNames("not json { broken");

      // Falls back to text parse on single line
      expect(result).toEqual(["not json { broken"]);
    });
  });
});
