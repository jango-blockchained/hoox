/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `hoox pyne` command group registration and structure.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Command } from "commander";
import { registerPyneCommand } from "./pyne-command.js";

describe("registerPyneCommand", () => {
  let program: Command;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    registerPyneCommand(program);
    originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit called with ${code}`);
    }) as typeof process.exit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("registers the top-level pyne command", () => {
    const pyne = program.commands.find((c) => c.name() === "pyne");
    expect(pyne).toBeDefined();
    const summary =
      (pyne as Command & { summary?: () => string }).summary?.() ??
      pyne?.description() ??
      "";
    expect(summary || "").toMatch(/PYNE|pyne|Pine/i);
  });

  it("attaches core subcommands", () => {
    const pyne = program.commands.find((c) => c.name() === "pyne");
    const subNames = pyne?.commands.map((s) => s.name()) ?? [];
    expect(subNames).toContain("health");
    expect(subNames).toContain("run");
    expect(subNames).toContain("scripts");
    expect(subNames).toContain("cron");
    expect(subNames).toContain("ingest");
    expect(subNames).toContain("sync-vendor");
    expect(subNames).toContain("deploy");
  });

  it("run requires a script-path argument", () => {
    const pyne = program.commands.find((c) => c.name() === "pyne")!;
    const run = pyne.commands.find((s) => s.name() === "run")!;
    expect(run.registeredArguments.length).toBeGreaterThan(0);
    expect(run.registeredArguments[0]?.required).toBe(true);
  });

  it("scripts has list/get/deploy/delete", () => {
    const pyne = program.commands.find((c) => c.name() === "pyne")!;
    const scripts = pyne.commands.find((s) => s.name() === "scripts")!;
    const names = scripts.commands.map((c) => c.name());
    expect(names).toContain("list");
    expect(names).toContain("get");
    expect(names).toContain("deploy");
    expect(names).toContain("delete");
  });

  it("health accepts --url option", () => {
    const pyne = program.commands.find((c) => c.name() === "pyne")!;
    const health = pyne.commands.find((s) => s.name() === "health")!;
    const flags = health.options.map((o) => o.long ?? o.short);
    expect(flags).toContain("--url");
  });
});
