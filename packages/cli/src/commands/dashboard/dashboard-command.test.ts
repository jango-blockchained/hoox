/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { Command } from "commander";
import { registerDashboardCommand } from "./dashboard-command.js";

describe("registerDashboardCommand", () => {
  it("registers dashboard command with dev and deploy subcommands", () => {
    const program = new Command();
    registerDashboardCommand(program);

    const dashboard = program.commands.find((c) => c.name() === "dashboard");
    expect(dashboard).toBeDefined();
    const subNames = dashboard!.commands.map((c) => c.name()).sort();
    expect(subNames).toEqual(["deploy", "dev"]);
  });

  it("does NOT register the old 'update-urls' subcommand", () => {
    const program = new Command();
    registerDashboardCommand(program);

    const dashboard = program.commands.find((c) => c.name() === "dashboard")!;
    const updateUrls = dashboard.commands.find(
      (c) => c.name() === "update-urls"
    );
    expect(updateUrls).toBeUndefined();
  });
});
