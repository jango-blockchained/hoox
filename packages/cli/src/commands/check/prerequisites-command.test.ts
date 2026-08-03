/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the `hoox check prerequisites` command.
 *
 * Stubs the PrerequisitesService to exercise:
 *   - the all-passed / some-failed paths
 *   - json / quiet / human output modes
 *   - the --tool filter passthrough
 *   - the error-handler catch block
 *   - the renderReport helper
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Command } from "commander";
import {
  registerPrerequisitesCommand,
  runPrerequisitesCheck,
} from "./prerequisites-command.js";
import { PrerequisitesService } from "../../services/prerequisites/index.js";
import type { PrerequisitesReport } from "../../services/prerequisites/prerequisites-service.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let chunks: string[] = [];
const originalWrite = process.stdout.write.bind(process.stdout);
let runAllMock: ReturnType<typeof mock>;
const ORIGINAL_PROTO = PrerequisitesService.prototype.runAll;

const passReport: PrerequisitesReport = {
  checks: [
    {
      name: "Bun",
      category: "tool",
      version: "1.3.0",
      required: ">=1.2",
      passed: true,
    },
    {
      name: "Git",
      category: "tool",
      version: "2.43.0",
      required: ">=2.40",
      passed: true,
    },
  ],
  allPassed: true,
};

const failReport: PrerequisitesReport = {
  checks: [
    {
      name: "Bun",
      category: "tool",
      version: "1.0.0",
      required: ">=1.2",
      passed: false,
      hint: "Run `bun upgrade`",
    },
  ],
  allPassed: false,
};

function setupRunAllMock(): void {
  runAllMock = mock(async () => passReport);
  (
    PrerequisitesService.prototype as unknown as Record<string, unknown>
  ).runAll = runAllMock;
}

function restoreRunAllMock(): void {
  (
    PrerequisitesService.prototype as unknown as Record<string, unknown>
  ).runAll = ORIGINAL_PROTO;
}

function setupStdoutMock(): void {
  chunks = [];
  process.stdout.write = mock((chunk: string | Buffer) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as unknown as typeof process.stdout.write;
}

function restoreStdoutMock(): void {
  process.stdout.write = originalWrite;
}

beforeEach(() => {
  process.exitCode = 0;
  setupRunAllMock();
  setupStdoutMock();
});

afterEach(() => {
  mock.restore();
  restoreRunAllMock();
  restoreStdoutMock();
  process.exitCode = 0;
});

// ---------------------------------------------------------------------------
// runPrerequisitesCheck
// ---------------------------------------------------------------------------

describe("runPrerequisitesCheck", () => {
  it("returns the report from the service", async () => {
    const report = await runPrerequisitesCheck();
    expect(report).toEqual(passReport);
  });

  it("accepts a custom service instance", async () => {
    const custom = new PrerequisitesService();
    const report = await runPrerequisitesCheck(custom);
    expect(report).toEqual(passReport);
  });
});

// ---------------------------------------------------------------------------
// registerPrerequisitesCommand — command registration
// ---------------------------------------------------------------------------

describe("registerPrerequisitesCommand", () => {
  it("registers the prerequisites subcommand on the parent", () => {
    const program = new Command().name("hoox").exitOverride(() => {});
    registerPrerequisitesCommand(program);
    const cmd = program.commands.find((c) => c.name() === "prerequisites");
    expect(cmd).toBeDefined();
    expect(cmd?.summary()).toContain("Validate toolchain");
  });

  it("exposes a --tool option", () => {
    const program = new Command().name("hoox").exitOverride(() => {});
    registerPrerequisitesCommand(program);
    const cmd = program.commands.find((c) => c.name() === "prerequisites")!;
    const toolOpt = cmd.options.find((o) => o.name() === "tool");
    expect(toolOpt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handlePrerequisites — output modes and exit codes
// ---------------------------------------------------------------------------

describe("prerequisites command action — output modes", () => {
  it("prints human-readable report by default and exits 0 on success", async () => {
    const program = new Command().name("hoox").exitOverride(() => {});
    registerPrerequisitesCommand(program);
    await program.parseAsync(["prerequisites"], { from: "user" });
    const out = chunks.join("");
    expect(out).toContain("Bun");
    expect(out).toContain("1.3.0");
    expect(out).toContain("All prerequisites met");
    expect(process.exitCode).toBe(0);
  });

  it("emits JSON when --json is set", async () => {
    const program = new Command()
      .name("hoox")
      .exitOverride(() => {})
      .option("--json", "JSON output")
      .option("--quiet", "Quiet output")
      .option("--no-color", "Disable color");
    registerPrerequisitesCommand(program);
    await program.parseAsync(["prerequisites", "--json"], { from: "user" });
    const out = chunks.join("");
    const parsed = JSON.parse(out);
    expect(parsed.allPassed).toBe(true);
  });

  it("emits no output in --quiet mode", async () => {
    const program = new Command()
      .name("hoox")
      .exitOverride(() => {})
      .option("--json", "JSON output")
      .option("--quiet", "Quiet output")
      .option("--no-color", "Disable color");
    registerPrerequisitesCommand(program);
    await program.parseAsync(["prerequisites", "--quiet"], { from: "user" });
    expect(chunks.join("")).toBe("");
  });

  it("sets exitCode = 1 when not all checks pass", async () => {
    runAllMock = mock(async () => failReport);
    (
      PrerequisitesService.prototype as unknown as Record<string, unknown>
    ).runAll = runAllMock;

    const program = new Command().name("hoox").exitOverride(() => {});
    registerPrerequisitesCommand(program);
    await program.parseAsync(["prerequisites"], { from: "user" });
    expect(process.exitCode).toBe(1);
    const out = chunks.join("");
    expect(out).toContain("Some prerequisites not met");
    expect(out).toContain("bun upgrade"); // hint
  });

  it("passes --tool to the service", async () => {
    let receivedTool: string | undefined;
    runAllMock = mock(async (tool?: string) => {
      receivedTool = tool;
      return passReport;
    });
    (
      PrerequisitesService.prototype as unknown as Record<string, unknown>
    ).runAll = runAllMock;

    const program = new Command().name("hoox").exitOverride(() => {});
    registerPrerequisitesCommand(program);
    await program.parseAsync(["prerequisites", "--tool", "bun"], {
      from: "user",
    });
    expect(receivedTool).toBe("bun");
  });

  it("catches service errors and sets exitCode = 1", async () => {
    runAllMock = mock(async () => {
      throw new Error("network down");
    });
    (
      PrerequisitesService.prototype as unknown as Record<string, unknown>
    ).runAll = runAllMock;

    const program = new Command().name("hoox").exitOverride(() => {});
    registerPrerequisitesCommand(program);
    await program.parseAsync(["prerequisites"], { from: "user" });
    expect(process.exitCode).toBe(1);
    const out = chunks.join("");
    expect(out).toContain("network down");
  });
});
