/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the `hoox completion` command.
 *
 * The command's job is to print a shell completion script to stdout
 * (bash, zsh, fish) or set exitCode=1 and write an error to stderr for an
 * unsupported shell. We capture both streams and assert on them.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Command } from "commander";
import { registerCompletionCommand } from "./completion-command.js";

function captureStreams(): {
  stdout: () => string;
  stderr: () => string;
  restore: () => void;
} {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Buffer) => {
    out.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Buffer) => {
    err.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout: () => out.join(""),
    stderr: () => err.join(""),
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

async function runCompletion(
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const program = new Command().name("hoox-test").exitOverride(() => {
    /* suppress commander exits during tests */
  });
  registerCompletionCommand(program);
  const cap = captureStreams();
  try {
    await program.parseAsync(args, { from: "user" });
  } finally {
    cap.restore();
  }
  return { stdout: cap.stdout(), stderr: cap.stderr() };
}

describe("registerCompletionCommand", () => {
  beforeEach(() => {
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = 0;
  });

  it("registers the completion command", () => {
    const program = new Command();
    registerCompletionCommand(program);
    const cmd = program.commands.find((c) => c.name() === "completion");
    expect(cmd).toBeDefined();
  });

  it("prints bash completion script", async () => {
    const { stdout } = await runCompletion(["completion", "bash"]);
    expect(stdout).toContain("_hoox_completion");
    expect(stdout).toContain("complete -F _hoox_completion hoox");
    expect(stdout).toContain("--json");
  });

  it("prints zsh completion script", async () => {
    const { stdout } = await runCompletion(["completion", "zsh"]);
    expect(stdout).toContain("#compdef hoox");
    expect(stdout).toContain("_hoox()");
  });

  it("prints fish completion script", async () => {
    const { stdout } = await runCompletion(["completion", "fish"]);
    expect(stdout).toContain("complete -c hoox");
    expect(stdout).toContain("__fish_use_subcommand");
    expect(stdout).toContain("onboard");
    expect(stdout).toContain("secrets");
    expect(stdout).toContain("__fish_seen_subcommand_from secrets");
    expect(process.exitCode).toBe(0);
  });

  it("prints usage when no shell arg given", async () => {
    const { stdout } = await runCompletion(["completion"]);
    expect(stdout).toContain("Usage: hoox completion");
    expect(stdout).toContain("bash|zsh|fish");
  });

  it("reports an invalid-usage error for unsupported shell", async () => {
    const { stdout } = await runCompletion(["completion", "powershell"]);
    expect(stdout).toContain('Unsupported shell "powershell"');
    expect(stdout).toContain("[2]"); // INVALID_USAGE exit code badge
    expect(process.exitCode).toBe(2);
  });
});
