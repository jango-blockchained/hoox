/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Command } from "commander";
import { registerFastpathCommand } from "./fastpath-command.js";

describe("registerFastpathCommand", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.option("--json", "JSON output");
    registerFastpathCommand(program);
  });

  afterEach(() => {
    mock.restore();
  });

  it("registers the fastpath subcommand with run/tail/report", () => {
    const fastpath = program.commands.find((c) => c.name() === "fastpath");
    expect(fastpath).toBeDefined();
    const subNames = fastpath!.commands.map((c) => c.name());
    expect(subNames).toContain("run");
    expect(subNames).toContain("tail");
    expect(subNames).toContain("report");
  });

  it("rejects invalid --action values with exit code 2", async () => {
    process.env.WEBHOOK_API_KEY_BINDING = "test-key";
    process.env.HOOX_GATEWAY_URL = "https://test.workers.dev";

    const fastpath = program.commands.find((c) => c.name() === "fastpath")!;
    const run = fastpath.commands.find((c) => c.name() === "run")!;

    // The CLI wrapper sets process.exitCode (no longer calls process.exit),
    // so the test reads exitCode directly after the parse settles.
    const origExitCode = process.exitCode;
    process.exitCode = 0;

    try {
      await run.parseAsync(["--action", "INVALID"], { from: "user" });
    } catch {
      // expected — invalid input throws CLIError
    }

    const code = process.exitCode ?? 0;
    process.exitCode = origExitCode;
    expect(code).toBe(2);
  });

  it("rejects --n > 1000 with exit code 2", async () => {
    process.env.WEBHOOK_API_KEY_BINDING = "test-key";
    process.env.HOOX_GATEWAY_URL = "https://test.workers.dev";

    const fastpath = program.commands.find((c) => c.name() === "fastpath")!;
    const run = fastpath.commands.find((c) => c.name() === "run")!;

    const origExitCode = process.exitCode;
    process.exitCode = 0;

    try {
      await run.parseAsync(["--n", "5000"], { from: "user" });
    } catch {
      // expected
    }

    const code = process.exitCode ?? 0;
    process.exitCode = origExitCode;
    expect(code).toBe(2);
  });
});
