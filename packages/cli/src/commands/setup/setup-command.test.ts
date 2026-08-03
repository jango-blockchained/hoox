/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, mock, afterEach } from "bun:test";
import { Command } from "commander";
import { registerSetupCommand } from "./setup-command.js";
import { SetupService } from "../../services/setup/index.js";

describe("registerSetupCommand", () => {
  afterEach(() => {
    mock.restore();
  });

  it("registers setup with skip flags and dry-run", () => {
    const program = new Command();
    registerSetupCommand(program);
    const setup = program.commands.find((c) => c.name() === "setup");
    expect(setup).toBeDefined();
    const optNames = setup!.options.map((o) => o.long).filter(Boolean);
    expect(optNames).toContain("--skip-keys");
    expect(optNames).toContain("--skip-db");
    expect(optNames).toContain("--skip-secrets");
    expect(optNames).toContain("--skip-dashboard");
    expect(optNames).toContain("--dry-run");
    expect(optNames).toContain("--database");
  });

  it("dry-run exits without calling SetupService.runAll", async () => {
    const runAll = mock(() =>
      Promise.resolve({ success: true, steps: [], secrets: [] })
    );
    // Patch prototype so the command's new SetupService() uses the mock
    const orig = SetupService.prototype.runAll;
    SetupService.prototype.runAll = runAll as typeof orig;
    const checkAuth = mock(() => Promise.resolve(true));
    SetupService.prototype.checkAuth =
      checkAuth as typeof SetupService.prototype.checkAuth;

    try {
      const program = new Command();
      program.exitOverride();
      program.option("--json");
      program.option("--quiet");
      program.option("-y, --yes");
      registerSetupCommand(program);

      await program.parseAsync(["setup", "--dry-run", "--quiet"], {
        from: "user",
      });

      expect(runAll).not.toHaveBeenCalled();
    } finally {
      SetupService.prototype.runAll = orig;
    }
  });

  it("forwards skip flags into SetupService.runAll", async () => {
    const runAll = mock(() =>
      Promise.resolve({
        success: true,
        steps: [{ step: "keys", success: true, message: "skipped" }],
        secrets: [],
      })
    );
    const origRun = SetupService.prototype.runAll;
    const origAuth = SetupService.prototype.checkAuth;
    SetupService.prototype.runAll = runAll as typeof origRun;
    SetupService.prototype.checkAuth = mock(() =>
      Promise.resolve(true)
    ) as typeof origAuth;

    try {
      const program = new Command();
      program.exitOverride();
      program.option("--json");
      program.option("--quiet");
      program.option("-y, --yes");
      registerSetupCommand(program);

      await program.parseAsync(
        [
          "setup",
          "--skip-keys",
          "--skip-db",
          "--skip-secrets",
          "--skip-dashboard",
          "--quiet",
          "--yes",
        ],
        { from: "user" }
      );

      expect(runAll).toHaveBeenCalled();
      const opts = (
        runAll.mock.calls as unknown as Array<[Record<string, unknown>]>
      )[0][0];
      expect(opts.skipKeys).toBe(true);
      expect(opts.skipDb).toBe(true);
      expect(opts.skipSecrets).toBe(true);
      expect(opts.skipDashboard).toBe(true);
    } finally {
      SetupService.prototype.runAll = origRun;
      SetupService.prototype.checkAuth = origAuth;
    }
  });

  it("sets exitCode when auth check fails", async () => {
    const origAuth = SetupService.prototype.checkAuth;
    SetupService.prototype.checkAuth = mock(() =>
      Promise.resolve(false)
    ) as typeof origAuth;

    try {
      process.exitCode = 0;
      const program = new Command();
      program.exitOverride();
      program.option("--json");
      program.option("--quiet");
      program.option("-y, --yes");
      registerSetupCommand(program);

      await program.parseAsync(["setup", "--quiet", "--yes"], { from: "user" });
      expect(process.exitCode).toBe(1);
    } finally {
      SetupService.prototype.checkAuth = origAuth;
      process.exitCode = 0;
    }
  });
});
