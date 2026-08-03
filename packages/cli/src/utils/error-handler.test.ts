/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Command } from "commander";
import { withErrorHandling, suggestForCommand } from "./error-handler.js";
import { CLIError, ExitCode } from "./errors.js";

describe("withErrorHandling — [code] badge in output", () => {
  let chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalExit = process.exit;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    chunks = [];
    process.stdout.write = mock((chunk: string | Buffer) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as unknown as typeof process.stdout.write;
    // Don't actually exit in tests.
    process.exit = mock(() => {}) as unknown as typeof process.exit;
    process.exitCode = 0;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    process.exit = originalExit;
    process.exitCode = originalExitCode;
  });

  it("renders a CLIError with a [code] badge", async () => {
    const handler = withErrorHandling(async () => {
      throw new CLIError("bad token", ExitCode.INVALID_USAGE);
    });

    await handler();
    const out = chunks.join("");
    expect(out).toContain("[2]"); // INVALID_USAGE is exit code 2
    expect(out).toContain("bad token");
  });

  it("passes through when handler resolves without error", async () => {
    const handler = withErrorHandling(async () => {
      // no-op
    });
    await handler();
    expect(process.exitCode).toBe(0);
  });

  it("sets exitCode = error.code for CLIError", async () => {
    const handler = withErrorHandling(async () => {
      throw new CLIError("oops", ExitCode.INFRA_UNAVAILABLE);
    });
    await handler();
    expect(process.exitCode).toBe(3); // INFRA_UNAVAILABLE
  });

  it("sets exitCode = 1 for plain Error", async () => {
    const handler = withErrorHandling(async () => {
      throw new Error("network down");
    });
    await handler();
    expect(process.exitCode).toBe(1);
    const out = chunks.join("");
    expect(out).toContain("network down");
  });

  it("sets exitCode = CommandFailed (4) for non-Error throw values", async () => {
    const handler = withErrorHandling(async () => {
      throw "raw string";
    });
    await handler();
    // ExitCode.CommandFailed is 4 (valid POSIX exit code; was historically
    // -1 which wrapped to 255 at the Node boundary — now fixed).
    expect(process.exitCode).toBe(4);
    const out = chunks.join("");
    expect(out).toContain("Unknown error");
  });

  it("prefixes the service name from options", async () => {
    const handler = withErrorHandling(
      async () => {
        throw new Error("auth failed");
      },
      { service: "auth" }
    );
    await handler();
    const out = chunks.join("");
    expect(out).toContain("[auth]");
  });
});

describe("suggestForCommand", () => {
  it("returns undefined for very short inputs", () => {
    const program = new Command().name("hoox").exitOverride(() => {});
    program.command("deploy");
    program.command("dev");
    expect(suggestForCommand(program, "x")).toBeUndefined();
  });

  it("returns a close-match command name", () => {
    const program = new Command().name("hoox").exitOverride(() => {});
    program.command("deploy");
    program.command("dev");
    program.command("diagnose");
    // "deplpy" is 1 char away from "deploy"
    expect(suggestForCommand(program, "deplpy")).toBe("deploy");
  });

  it("returns undefined when no candidate is within threshold", () => {
    const program = new Command().name("hoox").exitOverride(() => {});
    program.command("deploy");
    program.command("dev");
    expect(suggestForCommand(program, "xxxxxxxxxxxxx")).toBeUndefined();
  });

  it("walks nested subcommands and includes them in the candidate pool", () => {
    const program = new Command().name("hoox").exitOverride(() => {});
    const dev = program.command("dev");
    dev.command("start");
    dev.command("worker");
    // 2 chars away from "start"
    expect(suggestForCommand(program, "stard")).toBe("start");
  });
});
