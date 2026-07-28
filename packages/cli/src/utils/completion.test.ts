/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { Command } from "commander";
import { suggestNextCommand, getCmdPath } from "./completion.js";

describe("suggestNextCommand", () => {
  it("returns a suggestion for known happy-path commands", () => {
    expect(suggestNextCommand("init")?.command).toBe("hoox setup");
    expect(suggestNextCommand("setup")?.command).toBe("hoox deploy all");
    expect(suggestNextCommand("deploy all")?.command).toBe("hoox check health");
    expect(suggestNextCommand("check health")?.command).toBe(
      "hoox monitor trades"
    );
    expect(suggestNextCommand("keys generate")?.command).toBe(
      "hoox secrets sync --system"
    );
  });

  it("returns undefined for commands not in the map", () => {
    expect(suggestNextCommand("disclaimer")).toBeUndefined();
    expect(suggestNextCommand("")).toBeUndefined();
  });

  it("returns undefined for onboard (already does everything)", () => {
    expect(suggestNextCommand("onboard")).toBeUndefined();
  });

  it("matches the full command path, not the leaf", () => {
    expect(suggestNextCommand("health")).toBeUndefined();
  });
});

describe("getCmdPath", () => {
  it("returns the empty string for the root program", () => {
    const program = new Command();
    program.name("hoox");
    expect(getCmdPath(program)).toBe("");
  });

  it("returns the leaf name for a top-level command", () => {
    const program = new Command();
    const init = program.command("init");
    expect(getCmdPath(init)).toBe("init");
  });

  it("returns the full path for a subcommand", () => {
    const program = new Command();
    const deploy = program.command("deploy");
    const all = deploy.command("all");
    expect(getCmdPath(all)).toBe("deploy all");
  });

  it("returns the full path for a three-level command", () => {
    const program = new Command();
    const monitor = program.command("monitor");
    const killSwitch = monitor.command("kill-switch");
    const off = killSwitch.command("off");
    expect(getCmdPath(off)).toBe("monitor kill-switch off");
  });
});
