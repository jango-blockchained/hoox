/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { isRichMode } from "./format-mode.js";

describe("isRichMode", () => {
  // Snapshot env at describe-block time so we always restore to the
  // surrounding runner's environment, regardless of which test ran first
  // or what other test files mutated process.env concurrently.
  const ORIGINAL_ENV = { ...process.env };
  const ORIGINAL_TTY = process.stdout.isTTY;

  beforeAll(() => {
    // No-op — kept for symmetry with afterAll, in case future setup is needed.
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
    Object.defineProperty(process.stdout, "isTTY", {
      value: ORIGINAL_TTY,
      configurable: true,
    });
  });

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NO_COLOR;
    process.env.TERM = "xterm-256color";
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    Object.defineProperty(process.stdout, "isTTY", {
      value: ORIGINAL_TTY,
      configurable: true,
    });
  });

  it("returns true on a TTY with --json/--quiet absent", () => {
    expect(isRichMode()).toBe(true);
    expect(isRichMode({})).toBe(true);
  });

  it("returns false when --json is set", () => {
    expect(isRichMode({ json: true })).toBe(false);
  });

  it("returns false when --quiet is set", () => {
    expect(isRichMode({ quiet: true })).toBe(false);
  });

  it("returns false when NO_COLOR=1 is set", () => {
    process.env.NO_COLOR = "1";
    expect(isRichMode()).toBe(false);
  });

  it("returns false when TERM=dumb is set", () => {
    process.env.TERM = "dumb";
    expect(isRichMode()).toBe(false);
  });

  it("returns false when opts.noColor is set", () => {
    expect(isRichMode({ noColor: true })).toBe(false);
  });

  it("returns false when stdout is not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: undefined,
      configurable: true,
    });
    expect(isRichMode()).toBe(false);
  });

  it("respects --json over env vars (json wins)", () => {
    process.env.NO_COLOR = "1";
    expect(isRichMode({ json: true })).toBe(false);
  });
});
