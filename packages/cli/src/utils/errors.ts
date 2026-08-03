/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLIError — structured error class for the Hoox CLI.
 * Provides exit codes, optional details, hint, and recoverable flag.
 *
 * - `hint` is a short, actionable follow-up message (e.g. "Run `hoox infra` to
 *   create the D1 database, then re-run `hoox setup`."). It's shown to humans
 *   below the error line and included in `--json` output as an additive field.
 */

export const enum ExitCode {
  SUCCESS = 0,
  ERROR = 1,
  INVALID_USAGE = 2,
  INFRA_UNAVAILABLE = 3,
  /** A non-Error value was thrown (string/symbol/undefined). */
  CommandFailed = 4,
}

export class CLIError extends Error {
  constructor(
    message: string,
    public readonly code: ExitCode = ExitCode.ERROR,
    public readonly details?: string,
    public readonly recoverable = false,
    public readonly hint?: string
  ) {
    super(message);
    this.name = "CLIError";
  }
}
