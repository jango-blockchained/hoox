/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the deploy command.
 *
 * Stubs ConfigService and CloudflareService prototypes to verify the deploy
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

// We import at the top level — the deploy command module also imports
// @clack/prompts, which outputs to stdout during tests (fine).

// ---------------------------------------------------------------------------
// Stub variables — reassigned in beforeEach
// ---------------------------------------------------------------------------

let deployMock: ReturnType<typeof mock>;
let loadMock: ReturnType<typeof mock>;
let listEnabledWorkersMock: ReturnType<typeof mock>;
let getWorkerMock: ReturnType<typeof mock>;

// Preserve originals so we can restore them after tests
const origLoad = ConfigService.prototype
  .load as typeof ConfigService.prototype.load;
const origListEnabled = ConfigService.prototype
  .listEnabledWorkers as typeof ConfigService.prototype.listEnabledWorkers;
const origGetWorker = ConfigService.prototype
  .getWorker as typeof ConfigService.prototype.getWorker;
const origDeploy = CloudflareService.prototype
  .deploy as typeof CloudflareService.prototype.deploy;

beforeEach(() => {
  mock.restore();

  // Reset process.exitCode between tests
  process.exitCode = undefined;

  // Reset prototypes to originals (in case a previous test didn't restore)
  (ConfigService.prototype as unknown as Record<string, unknown>).load =
    origLoad;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).listEnabledWorkers = origListEnabled;
  (ConfigService.prototype as unknown as Record<string, unknown>).getWorker =
    origGetWorker;
  (CloudflareService.prototype as unknown as Record<string, unknown>).deploy =
    origDeploy;

  // Fresh mocks
  deployMock = mock(async (_path: string, _env?: string) => ({
    ok: true as const,
    value: { url: "https://test-worker.cryptolinx.workers.dev", rawOutput: "" },
  }));

  loadMock = mock(async () => ({}));
  listEnabledWorkersMock = mock(() => ["d1-worker", "hoox", "trade-worker"]);
  getWorkerMock = mock((_name: string) => ({
    enabled: true,
    path: "workers/test-worker",
  }));

  // Install mocks on prototypes
  (ConfigService.prototype as unknown as Record<string, unknown>).load =
    loadMock;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).listEnabledWorkers = listEnabledWorkersMock;
  (ConfigService.prototype as unknown as Record<string, unknown>).getWorker =
    getWorkerMock;
  (CloudflareService.prototype as unknown as Record<string, unknown>).deploy =
    deployMock;
});

afterEach(() => {
  mock.restore();

  // Restore originals
  (ConfigService.prototype as unknown as Record<string, unknown>).load =
    origLoad;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).listEnabledWorkers = origListEnabled;
  (ConfigService.prototype as unknown as Record<string, unknown>).getWorker =
    origGetWorker;
  (CloudflareService.prototype as unknown as Record<string, unknown>).deploy =
    origDeploy;
});

// ---------------------------------------------------------------------------
// Dynamic import — load the deploy command after stubs are in place
// ---------------------------------------------------------------------------

async function importDeployCommand(): Promise<{
  registerDeployCommand: typeof import("./deploy-command.js").registerDeployCommand;
}> {
  return import("./deploy-command.js");
}

/**
 * Create a fresh Commander program with the deploy command registered.
 */
async function createProgram(): Promise<Command> {
  const { registerDeployCommand } = await importDeployCommand();
  const program = new Command().name("hoox-test").exitOverride(() => {
    // Suppress Commander's own exit during tests
  });
  registerDeployCommand(program);
  return program;
}

/** Make deployMock return a failure for all subsequent calls. */
function makeDeployFail(error: string): void {
  deployMock = mock(async () => ({ ok: false as const, error }));
  (CloudflareService.prototype as unknown as Record<string, unknown>).deploy =
    deployMock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerDeployCommand", () => {
  // -- Command registration -------------------------------------------------

  it("registers 'deploy' as a command on the program", async () => {
    const program = await createProgram();
    const deployCmd = program.commands.find((c) => c.name() === "deploy");
    expect(deployCmd).toBeDefined();
  });

  it("registers 'deploy all' subcommand", async () => {
    const program = await createProgram();
    const deployCmd = program.commands.find((c) => c.name() === "deploy")!;
    const allCmd = deployCmd.commands.find((c) => c.name() === "all");
    expect(allCmd).toBeDefined();
    expect(allCmd!.description()).toContain("Deploy all enabled workers");
  });

  it("registers 'deploy workers' subcommand", async () => {
    const program = await createProgram();
    const deployCmd = program.commands.find((c) => c.name() === "deploy")!;
    const workersCmd = deployCmd.commands.find((c) => c.name() === "workers");
    expect(workersCmd).toBeDefined();
    expect(workersCmd!.description()).toContain("Deploy all enabled workers");
  });

  it("registers 'deploy worker <name>' subcommand with argument", async () => {
    const program = await createProgram();
    const deployCmd = program.commands.find((c) => c.name() === "deploy")!;
    const workerCmd = deployCmd.commands.find((c) => c.name() === "worker");
    expect(workerCmd).toBeDefined();
    const args = workerCmd!.registeredArguments;
    expect(args.some((a) => a.name() === "name")).toBe(true);
  });

  it("registers 'deploy dashboard' subcommand", async () => {
    const program = await createProgram();
    const deployCmd = program.commands.find((c) => c.name() === "deploy")!;
    const dashboardCmd = deployCmd.commands.find(
      (c) => c.name() === "dashboard"
    );
    expect(dashboardCmd).toBeDefined();
    expect(dashboardCmd!.description()).toContain("dashboard");
  });

  // -- deploy workers -------------------------------------------------------

  describe("deploy workers", () => {
    it("calls listEnabledWorkers and deploys each", async () => {
      listEnabledWorkersMock = mock(() => [
        "d1-worker",
        "hoox",
        "trade-worker",
      ]);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).listEnabledWorkers = listEnabledWorkersMock;

      const program = await createProgram();
      await program.parseAsync(["deploy", "workers"], { from: "user" });

      expect(listEnabledWorkersMock).toHaveBeenCalled();
      expect(deployMock).toHaveBeenCalledTimes(3);
    });

    it("handles no enabled workers gracefully", async () => {
      listEnabledWorkersMock = mock(() => []);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).listEnabledWorkers = listEnabledWorkersMock;

      const program = await createProgram();
      await program.parseAsync(["deploy", "workers"], { from: "user" });

      expect(deployMock).toHaveBeenCalledTimes(0);
    });

    it("continues deploying remaining workers on partial failure", async () => {
      listEnabledWorkersMock = mock(() => ["a", "b", "c"]);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).listEnabledWorkers = listEnabledWorkersMock;

      let calls = 0;
      deployMock = mock(async () => {
        calls++;
        if (calls === 2) {
          return { ok: false as const, error: "deploy error" };
        }
        return {
          ok: true as const,
          value: { url: "https://x.workers.dev", rawOutput: "" },
        };
      });
      (
        CloudflareService.prototype as unknown as Record<string, unknown>
      ).deploy = deployMock;

      const program = await createProgram();
      await program.parseAsync(["deploy", "workers"], { from: "user" });

      expect(deployMock).toHaveBeenCalledTimes(3);
      expect(calls).toBe(3);
    });

    it("passes --env to deploy", async () => {
      listEnabledWorkersMock = mock(() => ["single-worker"]);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).listEnabledWorkers = listEnabledWorkersMock;

      const program = await createProgram();
      await program.parseAsync(["deploy", "workers", "--env", "staging"], {
        from: "user",
      });

      expect(deployMock).toHaveBeenCalledTimes(1);
      const calls = (
        deployMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls;
      expect(calls[0][1]).toBe("staging");
    });
  });

  // -- deploy worker <name> -------------------------------------------------

  describe("deploy worker <name>", () => {
    it("deploys the specified worker successfully", async () => {
      const program = await createProgram();
      await program.parseAsync(["deploy", "worker", "hoox"], { from: "user" });

      expect(deployMock).toHaveBeenCalledTimes(1);
      const calls = (
        deployMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls;
      expect(calls[0][0]).toContain("test-worker");
    });

    it("passes --env to deploy", async () => {
      const program = await createProgram();
      await program.parseAsync(
        ["deploy", "worker", "hoox", "--env", "production"],
        { from: "user" }
      );

      const calls = (
        deployMock as unknown as { mock: { calls: Array<unknown[]> } }
      ).mock.calls;
      expect(calls[0][1]).toBe("production");
    });

    it("handles deploy failure (sets exitCode to 1)", async () => {
      makeDeployFail("authentication error");
      getWorkerMock = mock(() => ({
        enabled: true,
        path: "workers/hoox-worker",
      }));
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).getWorker = getWorkerMock;

      const program = await createProgram();
      await program.parseAsync(["deploy", "worker", "hoox"], { from: "user" });

      expect(process.exitCode).toBe(1);
    });

    it("handles unknown worker name without calling deploy", async () => {
      getWorkerMock = mock(() => undefined);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).getWorker = getWorkerMock;

      const program = await createProgram();
      await program.parseAsync(["deploy", "worker", "nonexistent"], {
        from: "user",
      });

      expect(deployMock).toHaveBeenCalledTimes(0);
      expect(process.exitCode).toBe(1);
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
    await program.parseAsync(["deploy", "workers"], { from: "user" });

    expect(process.exitCode).toBe(1);
  });
});
