/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { Command } from "commander";
import { renderHelp } from "./help-formatter.js";
import { stripAnsi } from "./theme.js";

function makeCmd(): Command {
  const program = new Command();
  program.name("hoox").description("Hoox CLI");
  const deploy = program
    .command("deploy all")
    .description("Deploy all workers + dashboard to Cloudflare")
    .option("--auto", "Skip confirmations")
    .option("--json", "Output JSON");
  deploy.addHelpText(
    "after",
    "\nExamples:\n  $ hoox deploy all\n  $ hoox deploy all --auto\n"
  );
  return deploy;
}

describe("renderHelp", () => {
  it("includes the program name and command path", () => {
    const out = renderHelp(makeCmd(), makeCmd().helpInformation);
    const stripped = stripAnsi(out);
    expect(stripped).toContain("hoox deploy all");
  });

  it("includes the description", () => {
    const out = renderHelp(makeCmd(), makeCmd().helpInformation);
    const stripped = stripAnsi(out);
    expect(stripped).toContain("Deploy all workers");
  });

  it("includes all option flags", () => {
    const out = renderHelp(makeCmd(), makeCmd().helpInformation);
    const stripped = stripAnsi(out);
    expect(stripped).toContain("--auto");
    expect(stripped).toContain("--json");
  });

  it("includes Examples block from addHelpText", () => {
    const out = renderHelp(makeCmd(), makeCmd().helpInformation);
    const stripped = stripAnsi(out);
    expect(stripped).toContain("Examples:");
    expect(stripped).toContain("$ hoox deploy all --auto");
  });

  it("uses section headers (Usage, Options, Examples)", () => {
    const out = renderHelp(makeCmd(), makeCmd().helpInformation);
    const stripped = stripAnsi(out);
    expect(stripped).toContain("Usage");
    expect(stripped).toContain("Options");
    expect(stripped).toContain("Examples");
  });
});
