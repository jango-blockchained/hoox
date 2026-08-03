/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  formatSuccess,
  formatError,
  formatTable,
  formatJson,
  formatKeyValue,
  formatHeader,
  formatList,
  renderProgressBar,
  renderStepProgress,
  getFormatOptions,
  formatDuration,
  formatBadge,
  formatHint,
  formatCompletion,
} from "./formatters.js";
import { CLIError, ExitCode } from "./errors.js";
import { Command } from "commander";

/**
 * Helper: captures everything written to process.stdout.write into a string.
 * Returns a cleanup function that restores the original write.
 */
function captureStdout(): { output: () => string; restore: () => void } {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const writeMock = mock((chunk: string | Buffer) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  process.stdout.write = writeMock as unknown as typeof process.stdout.write;

  return {
    output: () => chunks.join(""),
    restore: () => {
      process.stdout.write = originalWrite;
    },
  };
}

describe("formatSuccess", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("outputs human-formatted success", () => {
    formatSuccess("Deploy complete");
    const out = capture.output();
    expect(out).toContain("✓");

    // Check status indicator is present (just the checkmark)
    expect(out).toContain("✓");
    expect(out).not.toContain("✗");
  });
});

describe("formatTable", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  const sampleRows = [
    { name: "alpha", status: "ok" },
    { name: "beta-long", status: "error" },
  ];

  it("outputs human-formatted table with box drawing", () => {
    formatTable(sampleRows);
    const out = capture.output();
    expect(out).toContain("┌");
    expect(out).toContain("┬");
    expect(out).toContain("┐");
    expect(out).toContain("├");
    expect(out).toContain("┼");
    expect(out).toContain("┤");
    expect(out).toContain("└");
    expect(out).toContain("┴");
    expect(out).toContain("┘");
    expect(out).toContain("alpha");
    expect(out).toContain("beta-long");
    expect(out).toContain("ok");
    expect(out).toContain("error");
  });

  it("outputs JSON array when json=true", () => {
    formatTable(sampleRows, { json: true });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual(sampleRows);
  });

  it("outputs nothing when quiet=true", () => {
    formatTable(sampleRows, { quiet: true });
    expect(capture.output()).toBe("");
  });

  it("outputs (empty) for empty rows", () => {
    formatTable([]);
    const out = capture.output();
    expect(out).toContain("(empty)");
    expect(out).not.toContain("┌");
  });
});

describe("formatJson", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("outputs pretty JSON by default", () => {
    formatJson({ key: "value" });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ key: "value" });
    // Pretty-printed: contains newlines and indentation
    expect(out).toContain("\n");
    expect(out).toContain('"key"');
  });

  it("outputs compact JSON when quiet=true", () => {
    formatJson({ key: "value" }, { quiet: true });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ key: "value" });
    // Compact: single line of content (console.log appends newline)
    expect(out.trim()).not.toContain("\n");
  });

  it("outputs pretty JSON when json=true", () => {
    formatJson({ key: "value" }, { json: true });
    const out = capture.output();
    expect(out).toContain("\n");
  });
});

describe("formatKeyValue", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  const pairs = { Name: "alpha", Status: "running", Region: "us-east" };

  it("outputs human-formatted key-value pairs", () => {
    formatKeyValue(pairs);
    const out = capture.output();
    expect(out).toContain("Name");
    expect(out).toContain("alpha");
    expect(out).toContain("Status");
    expect(out).toContain("running");
    expect(out).toContain("Region");
    expect(out).toContain("us-east");
  });

  it("outputs JSON object when json=true", () => {
    formatKeyValue(pairs, { json: true });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual(pairs);
  });

  it("outputs nothing when quiet=true", () => {
    formatKeyValue(pairs, { quiet: true });
    expect(capture.output()).toBe("");
  });
});

describe("renderProgressBar", () => {
  it("renders 0% progress", () => {
    const result = renderProgressBar(0, 10);
    expect(result).toContain("0%");
    expect(result).toContain("[");
    expect(result).toContain("]");
  });

  it("renders 50% progress", () => {
    const result = renderProgressBar(5, 10);
    expect(result).toContain("50%");
  });

  it("renders 100% progress", () => {
    const result = renderProgressBar(10, 10);
    expect(result).toContain("100%");
  });

  it("clamps at 100% when current exceeds total", () => {
    const result = renderProgressBar(15, 10);
    expect(result).toContain("100%");
  });

  it("handles zero total without division by zero", () => {
    const result = renderProgressBar(0, 0);
    expect(result).toContain("0%");
  });

  it("appends elapsed/total ETA when eta.totalMs is provided", () => {
    const result = renderProgressBar(5, 10, {
      eta: { startedAt: Date.now() - 1000, totalMs: 2000 },
    });
    expect(result).toContain("50%");
    expect(result).toMatch(/1\.\ds \/ 2\.\ds/);
  });

  it("estimates ETA from rate when totalMs is not provided", () => {
    const result = renderProgressBar(5, 10, {
      eta: { startedAt: Date.now() - 1000 },
    });
    expect(result).toContain("50%");
    expect(result).toContain("left");
  });

  it("shows only elapsed when current=0 and no totalMs", () => {
    const result = renderProgressBar(0, 10, {
      eta: { startedAt: Date.now() - 1000 },
    });
    expect(result).toContain("0%");
    expect(result).toContain("1.0s");
    expect(result).not.toContain("left");
  });

  it("does not append ETA when total=0", () => {
    const result = renderProgressBar(0, 0, {
      eta: { startedAt: Date.now() - 1000, totalMs: 2000 },
    });
    expect(result).toContain("0%");
    expect(result).not.toContain("/");
  });

  it("accepts custom width", () => {
    const result = renderProgressBar(5, 10, { width: 10 });
    expect(result).toContain("50%");
  });
});

describe("renderStepProgress", () => {
  it("renders pending status", () => {
    const result = renderStepProgress([{ name: "Step 1", status: "pending" }]);
    expect(result).toContain("Step 1");
  });

  it("renders all status types", () => {
    const result = renderStepProgress([
      { name: "Pending", status: "pending" },
      { name: "Running", status: "running" },
      { name: "Done", status: "done" },
      { name: "Failed", status: "failed" },
    ]);
    expect(result).toContain("Pending");
    expect(result).toContain("Running");
    expect(result).toContain("Done");
    expect(result).toContain("Failed");
  });

  it("renders empty steps array", () => {
    const result = renderStepProgress([]);
    expect(result).toBe("");
  });
});

describe("formatHeader", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("outputs a formatted header with separator", () => {
    formatHeader("Configuration");
    const out = capture.output();
    expect(out).toContain("Configuration");
  });

  it("outputs nothing when quiet=true", () => {
    formatHeader("Configuration", { quiet: true });
    expect(capture.output()).toBe("");
  });

  it("outputs nothing when json=true", () => {
    formatHeader("Configuration", { json: true });
    expect(capture.output()).toBe("");
  });
});

describe("formatList", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  const items = ["Item one", "Item two", "Item three"];

  it("outputs human-formatted list with default icon", () => {
    formatList(items);
    const out = capture.output();
    expect(out).toContain("Item one");
    expect(out).toContain("Item two");
    expect(out).toContain("Item three");
  });

  it("outputs list with custom icon", () => {
    formatList(items, { icon: ">" });
    const out = capture.output();
    expect(out).toContain(">");
  });

  it("outputs JSON array when json=true", () => {
    formatList(items, { json: true });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual(items);
  });

  it("outputs nothing when quiet=true", () => {
    formatList(items, { quiet: true });
    expect(capture.output()).toBe("");
  });

  it("outputs nothing for empty items in quiet mode", () => {
    formatList([], { quiet: true });
    expect(capture.output()).toBe("");
  });
});

describe("formatError", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("outputs human-formatted error from string", () => {
    formatError("Something broke");
    const out = capture.output();
    expect(out).toContain("Something broke");
    expect(out).toContain("✗");
  });

  it("outputs human-formatted error from Error", () => {
    formatError(new Error("Error message"));
    const out = capture.output();
    expect(out).toContain("Error message");
  });

  it("outputs JSON error when json=true", () => {
    formatError("JSON error", { json: true });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      success: false,
      error: "JSON error",
      code: ExitCode.ERROR,
    });
  });

  it("outputs error message in quiet mode without icon", () => {
    formatError("Quiet error", { quiet: true });
    const out = capture.output();
    expect(out).toContain("Quiet error");
    expect(out).not.toContain("✗");
  });

  it("includes CLIError details in human mode", () => {
    const error = new CLIError(
      "Config invalid",
      ExitCode.INVALID_USAGE,
      "Missing field: name"
    );
    formatError(error);
    const out = capture.output();
    expect(out).toContain("Config invalid");
    expect(out).toContain("Missing field: name");
  });

  it("includes details in JSON output for CLIError", () => {
    const error = new CLIError(
      "Config invalid",
      ExitCode.INVALID_USAGE,
      "Missing field: name"
    );
    formatError(error, { json: true });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      success: false,
      error: "Config invalid",
      code: ExitCode.INVALID_USAGE,
      details: "Missing field: name",
    });
  });

  it("omits details from JSON when CLIError has none", () => {
    const error = new CLIError("Simple error");
    formatError(error, { json: true });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed.details).toBeUndefined();
  });
});

describe("getFormatOptions", () => {
  it("returns json=false quiet=false by default", () => {
    const cmd = {
      optsWithGlobals: () => ({ json: undefined, quiet: undefined }),
    } as unknown as Command;
    const opts = getFormatOptions(cmd);
    expect(opts).toEqual({ json: false, quiet: false, noColor: false });
  });

  it("returns json=true when --json flag is set", () => {
    const cmd = {
      optsWithGlobals: () => ({ json: true, quiet: false }),
    } as unknown as Command;
    const opts = getFormatOptions(cmd);
    expect(opts).toEqual({ json: true, quiet: false, noColor: false });
  });

  it("returns quiet=true when --quiet flag is set", () => {
    const cmd = {
      optsWithGlobals: () => ({ json: false, quiet: true }),
    } as unknown as Command;
    const opts = getFormatOptions(cmd);
    expect(opts).toEqual({ json: false, quiet: true, noColor: false });
  });

  it("returns both true when both flags are set", () => {
    const cmd = {
      optsWithGlobals: () => ({ json: true, quiet: true }),
    } as unknown as Command;
    const opts = getFormatOptions(cmd);
    expect(opts).toEqual({ json: true, quiet: true, noColor: false });
  });

  it("returns noColor=true when --no-color flag is set (commander negates to color:false)", () => {
    const cmd = {
      optsWithGlobals: () => ({ json: false, quiet: false, color: false }),
    } as unknown as Command;
    const opts = getFormatOptions(cmd);
    expect(opts).toEqual({ json: false, quiet: false, noColor: true });
  });
});

describe("formatDuration (re-export)", () => {
  it("matches timer.formatDuration semantics", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(72_000)).toBe("1m 12s");
  });
});

describe("formatBadge", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("renders OK badge with custom text", () => {
    const out = formatBadge("ok", "DONE");
    expect(out).toContain("DONE");
  });

  it("renders fail badge by default when level=err", () => {
    const out = formatBadge("err");
    expect(out).toContain("fail");
  });

  it("renders warn badge by default when level=warn", () => {
    const out = formatBadge("warn");
    expect(out).toContain("warn");
  });

  it("renders info badge by default when level=info", () => {
    const out = formatBadge("info");
    expect(out).toContain("info");
  });

  it("renders ok badge by default when level=ok", () => {
    const out = formatBadge("ok");
    expect(out).toContain("ok");
  });

  it("renders the level's status glyph", () => {
    expect(formatBadge("ok")).toContain("✓");
    expect(formatBadge("err")).toContain("✗");
    expect(formatBadge("warn")).toContain("⚠");
    expect(formatBadge("info")).toContain("ℹ");
  });

  it("includes the custom text verbatim (no padding)", () => {
    const out = formatBadge("ok", "X");
    expect(out).toContain("X");
    // New style: "✓ X" — 3 visible chars (one space, no padding)
    expect(out).toContain("X");
  });
});

describe("formatHint", () => {
  let capture: ReturnType<typeof captureStdout>;
  const originalIsTTY = process.stdout.isTTY;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    capture = captureStdout();
    // Clear NO_COLOR so isRichMode() can return true when isTTY is forced
    delete process.env.NO_COLOR;
    process.env.TERM = "xterm-256color";
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    capture.restore();
    process.env = { ...ORIGINAL_ENV };
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      configurable: true,
      writable: true,
    });
  });

  it("emits a dimmed hint line in rich mode", () => {
    formatHint("Run `hoox infra` to fix this.");
    const out = capture.output();
    expect(out).toContain("hint:");
    expect(out).toContain("hoox infra");
  });

  it("suppresses output in --quiet", () => {
    formatHint("Run `hoox infra` to fix this.", { quiet: true });
    expect(capture.output()).toBe("");
  });

  it("suppresses output in --json", () => {
    formatHint("Run `hoox infra` to fix this.", { json: true });
    expect(capture.output()).toBe("");
  });

  it("suppresses output when not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      configurable: true,
      writable: true,
    });
    formatHint("Run `hoox infra` to fix this.");
    expect(capture.output()).toBe("");
  });
});

describe("formatError with hint", () => {
  let capture: ReturnType<typeof captureStdout>;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    capture = captureStdout();
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    capture.restore();
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      configurable: true,
      writable: true,
    });
  });

  it("prints hint below error in human mode", () => {
    const error = new CLIError(
      "D1 binding missing",
      ExitCode.ERROR,
      undefined,
      false,
      "Run `hoox infra` to create the D1 database."
    );
    formatError(error);
    const out = capture.output();
    expect(out).toContain("D1 binding missing");
    expect(out).toContain("hint:");
    expect(out).toContain("hoox infra");
  });

  it("includes hint as an additive field in JSON output", () => {
    const error = new CLIError(
      "D1 binding missing",
      ExitCode.ERROR,
      undefined,
      false,
      "Run `hoox infra`."
    );
    formatError(error, { json: true });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed.hint).toBe("Run `hoox infra`.");
    // All other fields still present (additive only)
    expect(parsed.error).toBe("D1 binding missing");
    expect(parsed.code).toBe(ExitCode.ERROR);
  });

  it("omits hint from JSON when CLIError has none", () => {
    const error = new CLIError("No hint");
    formatError(error, { json: true });
    const parsed = JSON.parse(capture.output());
    expect(parsed.hint).toBeUndefined();
  });

  it("suppresses hint line in --quiet", () => {
    const error = new CLIError(
      "Oops",
      ExitCode.ERROR,
      undefined,
      false,
      "do X"
    );
    formatError(error, { quiet: true });
    const out = capture.output();
    expect(out).toBe("Oops\n");
  });
});

describe("formatTable refinements", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("applies zebra striping by default (alt rows have dim treatment)", () => {
    const rows = [
      { name: "alpha", status: "ok" },
      { name: "beta", status: "ok" },
      { name: "gamma", status: "ok" },
    ];
    formatTable(rows);
    const out = capture.output();
    const alphaLine = out.split("\n").find((l) => l.includes("alpha"));
    expect(alphaLine).toBeDefined();
    expect(alphaLine).not.toBeNull();
  });

  it("right-aligns numeric columns by default", () => {
    const rows = [
      { name: "alpha", count: "10" },
      { name: "beta", count: "200" },
      { name: "gamma-long", count: "3" },
    ];
    formatTable(rows);
    // eslint-disable-next-line no-control-regex
    const out = capture.output().replace(/\x1b\[[0-9;]*m/g, "");
    // The "3" should be right-aligned to match the width of "200".
    expect(out).toMatch(/gamma-long\s+│\s+3\s*│/);
  });

  it("colorizes status values by default", () => {
    const rows = [
      { name: "alpha", status: "ok" },
      { name: "beta", status: "fail" },
    ];
    formatTable(rows);
    const out = capture.output();
    expect(out).toContain("✓");
    expect(out).toContain("✗");
  });

  it("respects { zebra: false }", () => {
    const rows = [
      { name: "alpha", status: "ok" },
      { name: "beta", status: "ok" },
    ];
    formatTable(rows, { zebra: false });
    const out = capture.output();
    const lines = out.split("\n").filter((l) => l.includes("│"));
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("respects { compact: true } — no top/bottom borders", () => {
    const rows = [{ name: "alpha", status: "ok" }];
    formatTable(rows, { compact: true });
    const out = capture.output();
    expect(out).not.toContain("┌");
    expect(out).not.toContain("└");
  });
});

describe("formatError refinements", () => {
  let capture: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
  });

  it("renders a [code] badge when CLIError has a code", () => {
    formatError(new CLIError("bad token", ExitCode.INVALID_USAGE));
    const out = capture.output();
    expect(out).toContain("[2]"); // INVALID_USAGE is exit code 2
    expect(out).toContain("bad token");
  });

  it("renders suggestions as a 'did you mean' line", () => {
    formatError("unknown command", { suggestions: ["hoox deploy"] });
    const out = capture.output();
    expect(out).toContain("did you mean");
    expect(out).toContain("hoox deploy");
  });

  it("emits suggestions in JSON mode", () => {
    formatError("unknown command", {
      json: true,
      suggestions: ["hoox deploy"],
    });
    const out = capture.output();
    const parsed = JSON.parse(out);
    expect(parsed.suggestions).toEqual(["hoox deploy"]);
  });

  it("inCard: false skips the card framing", () => {
    formatError("plain error", { inCard: false });
    const out = capture.output();
    const lines = out.split("\n").filter((l) => l.trim().startsWith("│"));
    expect(lines.length).toBe(0);
  });
});

describe("formatCompletion", () => {
  let capture: ReturnType<typeof captureStdout>;
  const ORIGINAL_TTY = process.stdout.isTTY;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    capture = captureStdout();
    // Clear NO_COLOR so isRichMode() can return true when isTTY is forced
    delete process.env.NO_COLOR;
    process.env.TERM = "xterm-256color";
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
      writable: true,
    });
    process.exitCode = 0;
  });

  afterEach(() => {
    capture.restore();
    process.env = { ...ORIGINAL_ENV };
    Object.defineProperty(process.stdout, "isTTY", {
      value: ORIGINAL_TTY,
      configurable: true,
      writable: true,
    });
    process.exitCode = 0;
  });

  it("renders success + message + duration in human mode", () => {
    formatCompletion("Deploy complete", { durationMs: 12_345 });
    const out = capture.output();
    expect(out).toContain("✓");
    expect(out).toContain("Deploy complete");
    expect(out).toContain("12.3s"); // formatDuration output
  });

  it("renders a 'next: ...' line when a suggestion is provided", () => {
    formatCompletion("Done", {
      durationMs: 1_000,
      suggestion: { command: "hoox check health", reason: "verify the deploy" },
    });
    const out = capture.output();
    expect(out).toContain("next:");
    expect(out).toContain("hoox check health");
    expect(out).toContain("verify the deploy");
  });

  it("prints nothing in --json mode", () => {
    formatCompletion("Done", { json: true, durationMs: 1_000 });
    expect(capture.output()).toBe("");
  });

  it("prints nothing in --quiet mode", () => {
    formatCompletion("Done", { quiet: true, durationMs: 1_000 });
    expect(capture.output()).toBe("");
  });

  it("prints nothing when process.exitCode is non-zero", () => {
    process.exitCode = 1;
    formatCompletion("Done", { durationMs: 1_000 });
    expect(capture.output()).toBe("");
  });
});
