/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the logs command.
 *
 * Mocks Bun.spawn (for wrangler tail), ConfigService, and stream readers
 * to verify command logic in isolation. Uses the actual registerLogsCommand
 * function but intercepts the action handlers by stubbing dependencies.
 *
 * IMPORTANT: Saves and restores all prototype modifications in afterEach
 * to prevent cross-test pollution (no mock.module usage).
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Command } from "commander";
import { ConfigService } from "../../services/config/config-service.js";
import { registerLogsCommand } from "./logs-command.js";
import { ExitCode } from "../../utils/errors.js";

// ---------------------------------------------------------------------------
// Mock setup — stub Bun.spawn and ConfigService
// ---------------------------------------------------------------------------

// Preserve originals for restoration in afterEach
const origLoad = ConfigService.prototype.load;
const origListEnabled = ConfigService.prototype.listEnabledWorkers;
const origBunSpawn = Bun.spawn;

/**
 * Creates a mock ReadableStream that emits the given chunks and then closes.
 * This simulates the stdout of a wrangler tail process.
 */
function createMockReader(
  chunks: string[],
  delayMs = 0
): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        controller.enqueue(encoder.encode(chunk));
        chunkIndex++;
      }
      controller.close();
    },
  });

  return stream.getReader();
}

/**
 * Creates a mock Bun.spawn return value that simulates a clean exit.
 */
function createMockSpawn(chunks: string[], exitCode = 0) {
  const reader = createMockReader(chunks);
  return {
    stdout: {
      getReader: () => reader,
    },
    stderr: {
      getReader: () => createMockReader([]),
    },
    exited: Promise.resolve(exitCode),
    killed: false,
    kill: mock(() => {}),
  };
}

let spawnMock: ReturnType<typeof mock>;
let loadMock: ReturnType<typeof mock>;
let listEnabledWorkersMock: ReturnType<typeof mock>;

beforeEach(() => {
  mock.restore();

  // Restore ConfigService prototypes to originals first
  ConfigService.prototype.load = origLoad;
  ConfigService.prototype.listEnabledWorkers = origListEnabled;

  // Restore Bun.spawn
  (Bun as unknown as Record<string, unknown>).spawn = origBunSpawn;

  // Mock Bun.spawn
  spawnMock = mock((_args: string[], _options?: unknown) => {
    return createMockSpawn(["Test log line\n"]);
  });
  (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

  // Stub ConfigService prototype methods
  loadMock = mock(async () => ({}));
  listEnabledWorkersMock = mock(() => ["d1-worker", "hoox", "trade-worker"]);

  ConfigService.prototype.load = loadMock;
  ConfigService.prototype.listEnabledWorkers = listEnabledWorkersMock;
});

afterEach(() => {
  mock.restore();

  // Restore ConfigService prototypes
  ConfigService.prototype.load = origLoad;
  ConfigService.prototype.listEnabledWorkers = origListEnabled;

  // Restore Bun.spawn (individual property assignment — NOT globalThis.Bun)
  (Bun as unknown as Record<string, unknown>).spawn = origBunSpawn;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a fresh Commander program with the logs command registered.
 * Uses a custom name and exitOverride to prevent process exits during tests.
 */
function createProgram(): Command {
  const program = new Command().name("hoox-test").exitOverride(() => {
    // Suppress Commander's own exit during tests
  });
  registerLogsCommand(program);
  return program;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerLogsCommand", () => {
  // -- Command registration -------------------------------------------------

  it("registers 'logs' as a command on the program", () => {
    const program = createProgram();
    const logsCmd = program.commands.find((c) => c.name() === "logs");
    expect(logsCmd).toBeDefined();
  });

  it("registers 'logs worker <name>' subcommand", () => {
    const program = createProgram();
    const logsCmd = program.commands.find((c) => c.name() === "logs");
    expect(logsCmd).toBeDefined();
    const workerCmd = logsCmd!.commands.find((c) => c.name() === "worker");
    expect(workerCmd).toBeDefined();
    expect(workerCmd!.description()).toContain("Tail logs for a specific");
    // The argument should be <name>
    const args = workerCmd!.registeredArguments;
    expect(args.some((a) => a.name() === "name")).toBe(true);
  });

  it("registers 'logs all' subcommand", () => {
    const program = createProgram();
    const logsCmd = program.commands.find((c) => c.name() === "logs");
    expect(logsCmd).toBeDefined();
    const allCmd = logsCmd!.commands.find((c) => c.name() === "all");
    expect(allCmd).toBeDefined();
    expect(allCmd!.description()).toContain("all enabled workers");
  });

  it("'logs worker' has --level, --follow, --json options", () => {
    const program = createProgram();
    const logsCmd = program.commands.find((c) => c.name() === "logs");
    const workerCmd = logsCmd!.commands.find((c) => c.name() === "worker");
    expect(workerCmd).toBeDefined();

    const optionNames = workerCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--level");
    expect(optionNames).toContain("--follow");
    expect(optionNames).toContain("--json");
  });

  it("'logs all' has --level, --follow, --json options", () => {
    const program = createProgram();
    const logsCmd = program.commands.find((c) => c.name() === "logs");
    const allCmd = logsCmd!.commands.find((c) => c.name() === "all");
    expect(allCmd).toBeDefined();

    const optionNames = allCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--level");
    expect(optionNames).toContain("--follow");
    expect(optionNames).toContain("--json");
  });

  // -- logs worker <name> ---------------------------------------------------

  describe("logs worker <name>", () => {
    it("spawns wrangler tail for the specified worker", async () => {
      const program = createProgram();
      await program.parseAsync(["logs", "worker", "hoox"], { from: "user" });

      // Verify wrangler tail was called with the worker name
      expect(spawnMock).toHaveBeenCalled();
      const callArgs = (
        spawnMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls[0];
      const spawnArgs = callArgs[0] as string[];
      expect(spawnArgs).toContain("wrangler");
      expect(spawnArgs).toContain("tail");
      expect(spawnArgs).toContain("hoox");
    });

    it("passes --format json to wrangler when --json flag is set", async () => {
      const program = createProgram();
      await program.parseAsync(["logs", "worker", "hoox", "--json"], {
        from: "user",
      });

      const callArgs = (
        spawnMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls[0];
      const spawnArgs = callArgs[0] as string[];
      expect(spawnArgs).toContain("--format");
      expect(spawnArgs).toContain("json");
    });

    it("passes --format json to wrangler when --level is set to non-all", async () => {
      const program = createProgram();
      await program.parseAsync(["logs", "worker", "hoox", "--level", "error"], {
        from: "user",
      });

      const callArgs = (
        spawnMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls[0];
      const spawnArgs = callArgs[0] as string[];
      expect(spawnArgs).toContain("--format");
      expect(spawnArgs).toContain("json");
    });

    it("does NOT pass --format json when --level is all and --json not set", async () => {
      const program = createProgram();
      await program.parseAsync(["logs", "worker", "hoox"], { from: "user" });

      const callArgs = (
        spawnMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls[0];
      const spawnArgs = callArgs[0] as string[];
      expect(spawnArgs).not.toContain("--format");
    });

    it("handles spawn failure gracefully", async () => {
      spawnMock = mock(() => {
        throw new Error("wrangler not found");
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const program = createProgram();
      await program.parseAsync(["logs", "worker", "hoox"], { from: "user" });

      expect(process.exitCode).toBe(ExitCode.ERROR);
    });
  });

  // -- logs all -------------------------------------------------------------

  describe("logs all", () => {
    it("calls ConfigService.listEnabledWorkers and spawns tail for each", async () => {
      listEnabledWorkersMock = mock(() => ["hoox", "trade-worker"]);
      ConfigService.prototype.listEnabledWorkers = listEnabledWorkersMock;

      const program = createProgram();
      await program.parseAsync(["logs", "all"], { from: "user" });

      expect(listEnabledWorkersMock).toHaveBeenCalled();
      // Should spawn two processes (one for each worker)
      expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    it("handles no enabled workers gracefully", async () => {
      listEnabledWorkersMock = mock(() => []);
      ConfigService.prototype.listEnabledWorkers = listEnabledWorkersMock;

      const program = createProgram();
      await program.parseAsync(["logs", "all"], { from: "user" });

      // Should NOT spawn any processes
      expect(spawnMock).toHaveBeenCalledTimes(0);
    });

    it("handles config load failure gracefully", async () => {
      loadMock = mock(async () => {
        throw new Error("Config file not found");
      });
      ConfigService.prototype.load = loadMock;

      const program = createProgram();
      await program.parseAsync(["logs", "all"], { from: "user" });

      expect(process.exitCode).toBe(ExitCode.ERROR);
    });
  });
});
