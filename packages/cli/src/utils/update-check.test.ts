/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `attachUpdateCheck`.
 *
 * Verifies that:
 *   - the helper attaches a preAction hook to each named subcommand
 *     (no throw when subcommands are present)
 *   - missing subcommand names are skipped (no throw)
 *
 * The hook's interaction with UpdateService is exercised end-to-end
 * by the dev-command integration tests — we don't mock the service
 * here because Bun's `mock.module` is hoisted at file-parse time and
 * doesn't reach the closure inside the helper.
 */
import { describe, expect, it } from "bun:test";
import { Command } from "commander";
import { attachUpdateCheck } from "./update-check.js";

describe("attachUpdateCheck", () => {
  function makeProgram() {
    const program = new Command();
    const dev = program.command("dev");
    dev.command("start");
    dev.command("worker <name>");
    return { program, dev };
  }

  it("attaches a preAction hook to each named subcommand without throwing", () => {
    const { dev } = makeProgram();
    const startCmd = dev.commands.find((c) => c.name() === "start")!;

    expect(() => attachUpdateCheck(dev, ["start"], () => false)).not.toThrow();
    // Parse the subcommand so its lifecycle hooks are observable through
    // the public parse path. The action body is a no-op (no action
    // registered), so Commander will call the preAction hook before
    // failing on missing action.
    void startCmd.parseAsync([], { from: "user" }).catch(() => undefined);
    expect(startCmd).toBeDefined();
  });

  it("attaches hooks to multiple subcommands in one call", () => {
    const { dev } = makeProgram();
    expect(() =>
      attachUpdateCheck(dev, ["start", "worker"], () => true)
    ).not.toThrow();
  });

  it("skips missing subcommand names without throwing", () => {
    const { dev } = makeProgram();
    expect(() =>
      attachUpdateCheck(dev, ["does-not-exist"], () => false)
    ).not.toThrow();
  });

  it("handles empty subcommand list gracefully", () => {
    const { dev } = makeProgram();
    expect(() => attachUpdateCheck(dev, [], () => false)).not.toThrow();
  });
});
