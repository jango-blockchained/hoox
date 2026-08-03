/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the dev command.
 *
 * Stubs ConfigService and CloudflareService prototypes to verify the dev
 * command logic in isolation. Uses Commander's exitOverride to suppress
 * process exits during test runs.
 *
 * Subcommand actions are async — we use parseAsync() and then inspect mocks
 * to confirm correct service calls.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Command } from "commander";
import { ConfigService } from "../../services/config/config-service.js";
import { CloudflareService } from "../../services/cloudflare/cloudflare-service.js";
import { PrerequisitesService } from "../../services/prerequisites/index.js";
import { DockerService } from "../../services/docker/index.js";

// ---------------------------------------------------------------------------
// Stub variables — reassigned in beforeEach
// ---------------------------------------------------------------------------

let devMock: ReturnType<typeof mock>;
let loadMock: ReturnType<typeof mock>;
let listWorkersMock: ReturnType<typeof mock>;
let listEnabledWorkersMock: ReturnType<typeof mock>;
let getWorkerMock: ReturnType<typeof mock>;
let validateMock: ReturnType<typeof mock>;
let getDevRuntimeMock: ReturnType<typeof mock>;
let checkWranglerMock: ReturnType<typeof mock>;
let dockerCheckMock: ReturnType<typeof mock>;
let composeExistsMock: ReturnType<typeof mock>;

// Preserve originals so we can restore them after tests
const origLoad = ConfigService.prototype
  .load as typeof ConfigService.prototype.load;
const origListWorkers = ConfigService.prototype
  .listWorkers as typeof ConfigService.prototype.listWorkers;
const origListEnabled = ConfigService.prototype
  .listEnabledWorkers as typeof ConfigService.prototype.listEnabledWorkers;
const origGetWorker = ConfigService.prototype
  .getWorker as typeof ConfigService.prototype.getWorker;
const origValidate = ConfigService.prototype
  .validate as typeof ConfigService.prototype.validate;
const origGetDevRuntime = ConfigService.prototype
  .getDevRuntime as typeof ConfigService.prototype.getDevRuntime;
const origDev = CloudflareService.prototype
  .dev as typeof CloudflareService.prototype.dev;
const origCheckWrangler = PrerequisitesService.prototype
  .checkWranglerVersion as typeof PrerequisitesService.prototype.checkWranglerVersion;
const origDockerCheck = DockerService.prototype
  .checkAvailability as typeof DockerService.prototype.checkAvailability;
const origComposeExists = DockerService.prototype
  .composeFileExists as typeof DockerService.prototype.composeFileExists;

// Preserve original Bun globals
const origBunSpawn = Bun.spawn;
const origBunFile = Bun.file;

beforeEach(() => {
  mock.restore();

  // Reset process.exitCode between tests
  process.exitCode = undefined;

  // Restore prototypes to originals
  (ConfigService.prototype as unknown as Record<string, unknown>).load =
    origLoad;
  (ConfigService.prototype as unknown as Record<string, unknown>).listWorkers =
    origListWorkers;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).listEnabledWorkers = origListEnabled;
  (ConfigService.prototype as unknown as Record<string, unknown>).getWorker =
    origGetWorker;
  (ConfigService.prototype as unknown as Record<string, unknown>).validate =
    origValidate;
  (CloudflareService.prototype as unknown as Record<string, unknown>).dev =
    origDev;

  // Stub Bun.spawn to prevent actual process spawning during tests.
  // Uses individual property assignment (not globalThis.Bun = {...}) to
  // avoid "readonly property" errors in Bun 1.3.x.
  (Bun as unknown as unknown as Record<string, unknown>).spawn = mock(() => ({
    stdout: new Blob([]),
    stderr: new Blob([]),
    exited: Promise.resolve(0),
    stdin: { write: mock(() => {}), end: mock(() => {}) },
    kill: mock(() => {}),
  }));
  // Fresh mocks
  devMock = mock(async (_path: string, _port?: number) => ({
    ok: true as const,
    value: { port: _port ?? 8787 },
  }));

  loadMock = mock(async function (this: ConfigService) {
    // Use a regular function so `this` refers to the ConfigService instance
    (this as unknown as Record<string, unknown>).config = {};
    return {} as Record<string, unknown>;
  });
  listWorkersMock = mock(() => ["hoox", "trade-worker", "d1-worker"]);
  listEnabledWorkersMock = mock(() => ["hoox", "trade-worker", "d1-worker"]);
  getWorkerMock = mock((_name: string) => ({
    enabled: true,
    path: "workers/test-worker",
  }));
  validateMock = mock(() => ({ valid: true, errors: [] }));
  getDevRuntimeMock = mock(() => "native");
  checkWranglerMock = mock(async () => ({
    outdated: false,
  }));
  dockerCheckMock = mock(async () => ({ docker: false, compose: false }));
  composeExistsMock = mock(async () => false);

  // Install mocks on prototypes
  (ConfigService.prototype as unknown as Record<string, unknown>).load =
    loadMock;
  (ConfigService.prototype as unknown as Record<string, unknown>).listWorkers =
    listWorkersMock;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).listEnabledWorkers = listEnabledWorkersMock;
  (ConfigService.prototype as unknown as Record<string, unknown>).getWorker =
    getWorkerMock;
  (ConfigService.prototype as unknown as Record<string, unknown>).validate =
    validateMock;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).getDevRuntime = getDevRuntimeMock;
  (CloudflareService.prototype as unknown as Record<string, unknown>).dev =
    devMock;
  (
    PrerequisitesService.prototype as unknown as Record<string, unknown>
  ).checkWranglerVersion = checkWranglerMock;
  (
    DockerService.prototype as unknown as Record<string, unknown>
  ).checkAvailability = dockerCheckMock;
  (
    DockerService.prototype as unknown as Record<string, unknown>
  ).composeFileExists = composeExistsMock;
});

afterEach(() => {
  mock.restore();

  // Restore originals
  (ConfigService.prototype as unknown as Record<string, unknown>).load =
    origLoad;
  (ConfigService.prototype as unknown as Record<string, unknown>).listWorkers =
    origListWorkers;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).listEnabledWorkers = origListEnabled;
  (ConfigService.prototype as unknown as Record<string, unknown>).getWorker =
    origGetWorker;
  (ConfigService.prototype as unknown as Record<string, unknown>).validate =
    origValidate;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).getDevRuntime = origGetDevRuntime;
  (CloudflareService.prototype as unknown as Record<string, unknown>).dev =
    origDev;
  (
    PrerequisitesService.prototype as unknown as Record<string, unknown>
  ).checkWranglerVersion = origCheckWrangler;
  (
    DockerService.prototype as unknown as Record<string, unknown>
  ).checkAvailability = origDockerCheck;
  (
    DockerService.prototype as unknown as Record<string, unknown>
  ).composeFileExists = origComposeExists;

  // Restore Bun globals (individual property restore)
  (Bun as unknown as unknown as Record<string, unknown>).spawn = origBunSpawn;
  (Bun as unknown as unknown as Record<string, unknown>).file = origBunFile;
});

// ---------------------------------------------------------------------------
// Dynamic import — load the dev command after stubs are in place
// ---------------------------------------------------------------------------

async function importDevCommand(): Promise<{
  registerDevCommand: typeof import("./dev-command.js").registerDevCommand;
}> {
  return import("./dev-command.js");
}

/**
 * Create a fresh Commander program with the dev command registered.
 */
async function createProgram(): Promise<Command> {
  const { registerDevCommand } = await importDevCommand();
  const program = new Command().name("hoox-test").exitOverride(() => {
    // Suppress Commander's own exit during tests
  });
  registerDevCommand(program);
  return program;
}

/** Make devMock return a failure for all subsequent calls. */
function makeDevFail(error: string): void {
  devMock = mock(async () => ({ ok: false as const, error }));
  (CloudflareService.prototype as unknown as Record<string, unknown>).dev =
    devMock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerDevCommand", () => {
  // -- Command registration --------------------------------------------------

  it("registers 'dev' as a command on the program", async () => {
    const program = await createProgram();
    const devCmd = program.commands.find((c) => c.name() === "dev");
    expect(devCmd).toBeDefined();
  });

  it("registers 'dev start' subcommand", async () => {
    const program = await createProgram();
    const devCmd = program.commands.find((c) => c.name() === "dev")!;
    const startCmd = devCmd.commands.find((c) => c.name() === "start");
    expect(startCmd).toBeDefined();
    expect(startCmd!.description()).toContain("wrangler dev");
  });

  it("registers 'dev worker <name>' subcommand with argument", async () => {
    const program = await createProgram();
    const devCmd = program.commands.find((c) => c.name() === "dev")!;
    const workerCmd = devCmd.commands.find((c) => c.name() === "worker");
    expect(workerCmd).toBeDefined();
    expect(workerCmd!.description()).toContain("wrangler dev");
    const args = workerCmd!.registeredArguments;
    expect(args.some((a) => a.name() === "name")).toBe(true);
  });

  it("registers 'dev dashboard' subcommand", async () => {
    const program = await createProgram();
    const devCmd = program.commands.find((c) => c.name() === "dev")!;
    const dashboardCmd = devCmd.commands.find((c) => c.name() === "dashboard");
    expect(dashboardCmd).toBeDefined();
    expect(dashboardCmd!.description()).toContain("dashboard");
  });

  // -- dev start -------------------------------------------------------------

  describe("dev start", () => {
    it("handles config validation failure gracefully", async () => {
      validateMock = mock(() => ({
        valid: false,
        errors: ["global.cloudflare_account_id is required"],
      }));
      (ConfigService.prototype as unknown as Record<string, unknown>).validate =
        validateMock;

      const program = await createProgram();
      await program.parseAsync(["dev", "start"], { from: "user" });

      expect(process.exitCode).toBe(2); // INVALID_USAGE
    });

    it("handles no enabled workers gracefully", async () => {
      listEnabledWorkersMock = mock(() => []);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).listEnabledWorkers = listEnabledWorkersMock;

      const program = await createProgram();
      await program.parseAsync(["dev", "start"], { from: "user" });

      expect(process.exitCode).toBe(2); // INVALID_USAGE
    });

    it("starts all enabled workers on assigned ports", async () => {
      listEnabledWorkersMock = mock(() => ["hoox", "trade-worker"]);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).listEnabledWorkers = listEnabledWorkersMock;

      const program = await createProgram();
      await program.parseAsync(["dev", "start"], { from: "user" });

      // Both workers should be started via CloudflareService.dev()
      expect(devMock).toHaveBeenCalledTimes(2);
      const calls = (
        devMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls;
      // hoox → port 8787, trade-worker → port 8788
      expect(calls[0][1]).toBe(8787);
      expect(calls[1][1]).toBe(8788);
      // exitCode remains unset since the action ran successfully
    });
  });

  // -- dev worker <name> -----------------------------------------------------

  describe("dev worker <name>", () => {
    it("starts the specified worker with default port", async () => {
      const program = await createProgram();
      await program.parseAsync(["dev", "worker", "hoox"], { from: "user" });

      expect(devMock).toHaveBeenCalledTimes(1);
      const calls = (
        devMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls;
      expect(calls[0][0]).toContain("test-worker");
      expect(calls[0][1]).toBe(8787);
    });

    it("passes --port to dev service", async () => {
      const program = await createProgram();
      await program.parseAsync(["dev", "worker", "hoox", "--port", "3000"], {
        from: "user",
      });

      const calls = (
        devMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls;
      expect(calls[0][1]).toBe(3000);
    });

    it("handles unknown worker name", async () => {
      getWorkerMock = mock(() => undefined);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).getWorker = getWorkerMock;

      const program = await createProgram();
      await program.parseAsync(["dev", "worker", "nonexistent"], {
        from: "user",
      });

      expect(devMock).toHaveBeenCalledTimes(0);
      expect(process.exitCode).toBe(2); // INVALID_USAGE
    });

    it("handles disabled worker", async () => {
      getWorkerMock = mock(() => ({
        enabled: false,
        path: "workers/disabled-worker",
      }));
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).getWorker = getWorkerMock;

      const program = await createProgram();
      await program.parseAsync(["dev", "worker", "disabled-worker"], {
        from: "user",
      });

      expect(devMock).toHaveBeenCalledTimes(0);
      expect(process.exitCode).toBe(2); // INVALID_USAGE
    });

    it("handles dev failure (sets exitCode to 1)", async () => {
      makeDevFail("wrangler not found");
      getWorkerMock = mock(() => ({
        enabled: true,
        path: "workers/hoox-worker",
      }));
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).getWorker = getWorkerMock;

      const program = await createProgram();
      await program.parseAsync(["dev", "worker", "hoox"], { from: "user" });

      expect(process.exitCode).toBe(1); // ERROR
    });
  });

  // -- dev dashboard ---------------------------------------------------------

  describe("dev dashboard", () => {
    it("handles missing dashboard directory", async () => {
      // Override Bun.file for this test to say dashboard doesn't exist
      (Bun as unknown as unknown as Record<string, unknown>).file = mock(
        (_p: string) => ({
          exists: mock(async () => false),
        })
      );

      const program = await createProgram();
      await program.parseAsync(["dev", "dashboard"], { from: "user" });

      expect(process.exitCode).toBe(2); // INVALID_USAGE
    });
  });

  // -- config loading errors ------------------------------------------------

  it("handles config load failure gracefully", async () => {
    loadMock = mock(async () => {
      throw new Error("Config file not found");
    });
    (ConfigService.prototype as unknown as Record<string, unknown>).load =
      loadMock;

    const program = await createProgram();
    await program.parseAsync(["dev", "start"], { from: "user" });

    expect(process.exitCode).toBe(1);
  });
});
