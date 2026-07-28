/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { CLIError, ExitCode } from "./errors.js";

// CommandItem is defined in errors.js and re-exported; avoid redeclare

describe("ExitCode", () => {
  it("has correct numeric values", () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.ERROR).toBe(1);
    expect(ExitCode.INVALID_USAGE).toBe(2);
    expect(ExitCode.INFRA_UNAVAILABLE).toBe(3);
  });

  it("is a numeric enum with expected values", () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.ERROR).toBe(1);
    expect(ExitCode.INVALID_USAGE).toBe(2);
    expect(ExitCode.INFRA_UNAVAILABLE).toBe(3);
    // All values are distinct
    const values = [
      ExitCode.SUCCESS,
      ExitCode.ERROR,
      ExitCode.INVALID_USAGE,
      ExitCode.INFRA_UNAVAILABLE,
    ];
    expect(new Set(values).size).toBe(4);
  });
});

describe("CLIError", () => {
  it("constructs with message and defaults", () => {
    const err = new CLIError("something went wrong");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CLIError);
    expect(err.name).toBe("CLIError");
    expect(err.message).toBe("something went wrong");
    expect(err.code).toBe(ExitCode.ERROR);
    expect(err.details).toBeUndefined();
    expect(err.recoverable).toBe(false);
  });

  it("constructs with all fields", () => {
    const err = new CLIError(
      "invalid input",
      ExitCode.INVALID_USAGE,
      "Expected --name to be a non-empty string",
      true
    );
    expect(err.message).toBe("invalid input");
    expect(err.code).toBe(ExitCode.INVALID_USAGE);
    expect(err.details).toBe("Expected --name to be a non-empty string");
    expect(err.recoverable).toBe(true);
  });

  it("supports INFRA_UNAVAILABLE code", () => {
    const err = new CLIError(
      "Cloudflare API unreachable",
      ExitCode.INFRA_UNAVAILABLE,
      "Check your network or try again later"
    );
    expect(err.code).toBe(3);
    expect(err.recoverable).toBe(false);
  });

  it("has a string representation that includes the name", () => {
    const err = new CLIError("fail");
    expect(err.toString()).toBe("CLIError: fail");
  });
});
