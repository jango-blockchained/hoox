/**
 * Unit tests for the repair command.
 *
 * Stubs RepairService, ConfigService, CloudflareService, DbService, and
 * KvSyncService prototypes to verify repair command logic in isolation.
 * Uses Commander's exitOverride to suppress process exits during tests.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Command } from "commander";
import { RepairService } from "./repair-service.js";
import { ConfigService } from "../../services/config/config-service.js";
import { CloudflareService } from "../../services/cloudflare/cloudflare-service.js";
import { DbService } from "../../services/db/db-service.js";
import { KvSyncService } from "../../services/kv/kv-sync-service.js";

// Stubs
let runSystemCheckMock: ReturnType<typeof mock>;
let deployMock: ReturnType<typeof mock>;
let configLoadMock: ReturnType<typeof mock>;
let configGetWorkerMock: ReturnType<typeof mock>;

// Preserve originals
const origRunSystemCheck = RepairService.prototype.runSystemCheck;
const origDeploy = CloudflareService.prototype.deploy;
const origD1List = CloudflareService.prototype.d1List;
const origKvList = CloudflareService.prototype.kvList;
const origR2List = CloudflareService.prototype.r2List;
const origQueueList = CloudflareService.prototype.queueList;
const origResolveDbName = DbService.prototype.resolveDbName;
const origApply = DbService.prototype.apply;
const origMigrate = DbService.prototype.migrate;
const origExport = DbService.prototype.export;
const origReset = DbService.prototype.reset;
const origResolveNs = KvSyncService.prototype.resolveNamespaceId;
const origKvSet = KvSyncService.prototype.set;
const origConfigLoad = ConfigService.prototype.load;
const origConfigGetWorker = ConfigService.prototype.getWorker;
const origConfigListEnabled = ConfigService.prototype.listEnabledWorkers;

function restoreProtos(): void {
  (
    RepairService.prototype as unknown as Record<string, unknown>
  ).runSystemCheck = origRunSystemCheck;
  (CloudflareService.prototype as unknown as Record<string, unknown>).deploy =
    origDeploy;
  (CloudflareService.prototype as unknown as Record<string, unknown>).d1List =
    origD1List;
  (CloudflareService.prototype as unknown as Record<string, unknown>).kvList =
    origKvList;
  (CloudflareService.prototype as unknown as Record<string, unknown>).r2List =
    origR2List;
  (
    CloudflareService.prototype as unknown as Record<string, unknown>
  ).queueList = origQueueList;
  (DbService.prototype as unknown as Record<string, unknown>).resolveDbName =
    origResolveDbName;
  (DbService.prototype as unknown as Record<string, unknown>).apply = origApply;
  (DbService.prototype as unknown as Record<string, unknown>).migrate =
    origMigrate;
  (DbService.prototype as unknown as Record<string, unknown>).export =
    origExport;
  (DbService.prototype as unknown as Record<string, unknown>).reset = origReset;
  (
    KvSyncService.prototype as unknown as Record<string, unknown>
  ).resolveNamespaceId = origResolveNs;
  (KvSyncService.prototype as unknown as Record<string, unknown>).set =
    origKvSet;
  (ConfigService.prototype as unknown as Record<string, unknown>).load =
    origConfigLoad;
  (ConfigService.prototype as unknown as Record<string, unknown>).getWorker =
    origConfigGetWorker;
  (
    ConfigService.prototype as unknown as Record<string, unknown>
  ).listEnabledWorkers = origConfigListEnabled;
}

beforeEach(() => {
  mock.restore();
  process.exitCode = 0;
  restoreProtos();

  // Fresh mocks
  runSystemCheckMock = mock(async () => ({
    steps: [
      { step: "Worker submodules", success: true, message: "All present" },
      { step: "Dependencies", success: true, message: "Installed" },
      { step: "TypeScript", success: true, message: "No errors" },
      { step: "Infrastructure", success: true, message: "All ok" },
      { step: "Secrets", success: true, message: "All present" },
    ],
    allPassed: true,
    passedCount: 5,
    failedCount: 0,
  }));

  deployMock = mock(async (_path: string, _env?: string) => ({
    ok: true as const,
    value: { url: "https://test-worker.cryptolinx.workers.dev" },
  }));

  configLoadMock = mock(async function (this: ConfigService) {
    (this as unknown as Record<string, unknown>).config = {
      global: { cloudflare_account_id: "test-account" },
      workers: { hoox: { enabled: true, path: "workers/hoox-worker" } },
    };
    return (this as unknown as Record<string, unknown>).config;
  });
  configGetWorkerMock = mock((name: string) => {
    if (name === "hoox") return { enabled: true, path: "workers/hoox-worker" };
    return undefined;
  });

  (
    RepairService.prototype as unknown as Record<string, unknown>
  ).runSystemCheck = runSystemCheckMock;
  (CloudflareService.prototype as unknown as Record<string, unknown>).deploy =
    deployMock;
  (ConfigService.prototype as unknown as Record<string, unknown>).load =
    configLoadMock;
  (ConfigService.prototype as unknown as Record<string, unknown>).getWorker =
    configGetWorkerMock;
});

afterEach(() => {
  mock.restore();
  restoreProtos();
});

async function importRepairCommand(): Promise<{
  registerRepairCommand: typeof import("./repair-command.js").registerRepairCommand;
}> {
  return import("./repair-command.js");
}

async function createProgram(): Promise<Command> {
  const { registerRepairCommand } = await importRepairCommand();
  const program = new Command()
    .name("hoox-test")
    .exitOverride(() => {})
    // Mirror global CLI flags so getFormatOptions(cmd) sees --json
    .option("--json", "Output in JSON format")
    .option("--quiet", "Minimal output");
  registerRepairCommand(program);
  return program;
}

describe("registerRepairCommand", () => {
  // -- Command registration -------------------------------------------------

  it("registers 'repair' as a command on the program", async () => {
    const program = await createProgram();
    const cmd = program.commands.find((c) => c.name() === "repair");
    expect(cmd).toBeDefined();
  });

  it("registers 'repair check' subcommand", async () => {
    const program = await createProgram();
    const repairCmd = program.commands.find((c) => c.name() === "repair")!;
    expect(repairCmd.commands.find((c) => c.name() === "check")).toBeDefined();
  });

  it("registers 'repair worker <name>' with argument", async () => {
    const program = await createProgram();
    const repairCmd = program.commands.find((c) => c.name() === "repair")!;
    const workerCmd = repairCmd.commands.find((c) => c.name() === "worker");
    expect(workerCmd).toBeDefined();
    expect(
      workerCmd!.registeredArguments.some((a) => a.name() === "name")
    ).toBe(true);
  });

  it("registers 'repair infra' subcommand", async () => {
    const program = await createProgram();
    const repairCmd = program.commands.find((c) => c.name() === "repair")!;
    expect(repairCmd.commands.find((c) => c.name() === "infra")).toBeDefined();
  });

  it("registers 'repair secrets' subcommand", async () => {
    const program = await createProgram();
    const repairCmd = program.commands.find((c) => c.name() === "repair")!;
    expect(
      repairCmd.commands.find((c) => c.name() === "secrets")
    ).toBeDefined();
  });

  it("registers 'repair kv' subcommand", async () => {
    const program = await createProgram();
    const repairCmd = program.commands.find((c) => c.name() === "repair")!;
    expect(repairCmd.commands.find((c) => c.name() === "kv")).toBeDefined();
  });

  it("registers 'repair db' subcommand", async () => {
    const program = await createProgram();
    const repairCmd = program.commands.find((c) => c.name() === "repair")!;
    expect(repairCmd.commands.find((c) => c.name() === "db")).toBeDefined();
  });

  it("registers 'repair rebuild' subcommand", async () => {
    const program = await createProgram();
    const repairCmd = program.commands.find((c) => c.name() === "repair")!;
    expect(
      repairCmd.commands.find((c) => c.name() === "rebuild")
    ).toBeDefined();
  });

  // -- repair check ---------------------------------------------------------

  describe("repair check", () => {
    it("calls runSystemCheck", async () => {
      const program = await createProgram();
      await program.parseAsync(["repair", "check"], { from: "user" });
      expect(runSystemCheckMock).toHaveBeenCalled();
    });

    it("exits cleanly on all passed", async () => {
      const program = await createProgram();
      await program.parseAsync(["repair", "check"], { from: "user" });
      expect(process.exitCode).toBe(0);
    });

    it("sets exitCode on failure", async () => {
      runSystemCheckMock = mock(async () => {
        throw new Error("Check failed");
      });
      (
        RepairService.prototype as unknown as Record<string, unknown>
      ).runSystemCheck = runSystemCheckMock;

      const program = await createProgram();
      await program.parseAsync(["repair", "check"], { from: "user" });
      expect(process.exitCode).toBe(1);
    });

    it("prints step details and exits 1 when checks fail", async () => {
      runSystemCheckMock = mock(async () => ({
        steps: [
          {
            step: "Worker submodules",
            success: false,
            message: "Missing submodules",
          },
          { step: "Dependencies", success: true, message: "Skipped" },
          { step: "TypeScript", success: true, message: "No errors" },
          {
            step: "Secrets",
            success: false,
            message: "3/10 missing",
          },
        ],
        allPassed: false,
        passedCount: 2,
        failedCount: 2,
      }));
      (
        RepairService.prototype as unknown as Record<string, unknown>
      ).runSystemCheck = runSystemCheckMock;

      const writes: string[] = [];
      const origWrite = process.stdout.write.bind(process.stdout);
      (
        process.stdout as unknown as { write: typeof process.stdout.write }
      ).write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
        writes.push(
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
        );
        return origWrite(chunk as never, ...(rest as never[]));
      }) as typeof process.stdout.write;

      try {
        const program = await createProgram();
        await program.parseAsync(["repair", "check"], { from: "user" });
        const out = writes.join("");
        expect(out).toContain("Worker submodules");
        expect(out).toContain("Missing submodules");
        expect(out).toContain("Secrets");
        expect(process.exitCode).toBe(1);
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it("emits full JSON result when --json is set", async () => {
      const writes: string[] = [];
      const origWrite = process.stdout.write.bind(process.stdout);
      (
        process.stdout as unknown as { write: typeof process.stdout.write }
      ).write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
        writes.push(
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
        );
        return origWrite(chunk as never, ...(rest as never[]));
      }) as typeof process.stdout.write;

      try {
        const program = await createProgram();
        await program.parseAsync(["--json", "repair", "check"], {
          from: "user",
        });
        const jsonLine = writes.find((w) => {
          try {
            const p = JSON.parse(w);
            return p && Array.isArray(p.steps);
          } catch {
            return false;
          }
        });
        expect(jsonLine).toBeDefined();
        const parsed = JSON.parse(jsonLine!);
        expect(parsed.allPassed).toBe(true);
        expect(parsed.steps.length).toBeGreaterThan(0);
      } finally {
        process.stdout.write = origWrite;
      }
    });
  });

  // -- repair worker <name> --------------------------------------------------

  describe("repair worker <name>", () => {
    it("calls deploy for the specified worker", async () => {
      const program = await createProgram();
      await program.parseAsync(["repair", "worker", "hoox"], { from: "user" });
      expect(deployMock).toHaveBeenCalled();
    });

    it("handles unknown worker name", async () => {
      configGetWorkerMock = mock(() => undefined);
      (
        ConfigService.prototype as unknown as Record<string, unknown>
      ).getWorker = configGetWorkerMock;

      const program = await createProgram();
      await program.parseAsync(["repair", "worker", "nonexistent"], {
        from: "user",
      });
      expect(process.exitCode).toBe(1);
    });
  });
});
