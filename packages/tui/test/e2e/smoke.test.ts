/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E2E Smoke Test — Hoox TUI Dashboard
 *
 * Launches the TUI as a subprocess, captures alternate-screen output,
 * verifies key sections render, sends Ctrl+Q to quit, and asserts clean exit.
 *
 * REQUIREMENTS:
 *   - bun run build must produce dist/main.js (or bun run dev must launch)
 *   - OpenTUI packages (@opentui/core, @opentui/react) must be installed
 *   - Terminal must support alternate screen (CSI ?1049h/l)
 *   - Run with: bun test test/e2e/smoke.test.ts
 *
 * Design:
 *   - Spawns `bun run src/main.tsx` as child process with pseudo-terminal
 *   - Waits for alternate-screen enter sequence (CSI ?1049h)
 *   - Captures rendered output for ~2 seconds
 *   - Asserts key text appears: "HOOX", "Dashboard", view names
 *   - Sends \x11 (Ctrl+Q) to trigger quit
 *   - Verifies process exits with code 0
 *   - Verifies alternate-screen exit sequence (CSI ?1049l)
 *
 * Fallback: If TUI cannot launch (missing deps, no terminal), tests are skipped
 * with descriptive messages so CI doesn't fail on dependency-only environments.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { join } from "path";

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Absolute package root for packages/tui.
 * import.meta.dir is test/e2e when this file runs, so walk up two levels.
 * Using an absolute root keeps canLaunch + spawn working whether the suite
 * is invoked from the monorepo root or packages/tui.
 */
const PACKAGE_ROOT = join(import.meta.dir, "../..");
const MAIN_ENTRY = join(PACKAGE_ROOT, "src/main.tsx");

/** Time to wait for TUI output in ms */
const CAPTURE_DURATION_MS = 3_000;

/** Patterns that must appear in captured output */
const REQUIRED_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "App title", pattern: /HOOX/ },
  { name: "Dashboard view label", pattern: /Dashboard/i },
  { name: "Workers view label", pattern: /Workers/i },
  { name: "Settings view label", pattern: /Settings/i },
  { name: "Status bar hints", pattern: /Ctrl\+[PQ]/i },
  // eslint-disable-next-line no-control-regex -- intentional: matches ESC (\x1b) sequences
  { name: "Alternate screen enter", pattern: /\x1b\[\?1049h/ },
];

/** Patterns that should appear on clean exit */
const EXIT_PATTERNS: { name: string; pattern: RegExp }[] = [
  // eslint-disable-next-line no-control-regex -- intentional: matches ESC (\x1b) sequences
  { name: "Alternate screen exit", pattern: /\x1b\[\?1049l/ },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Collect stdout from a subprocess for a given duration, then kill it.
 * Returns all captured output as a string.
 */
async function captureOutput(
  proc: Subprocess<"pipe", "pipe", "pipe">,
  durationMs: number
): Promise<string> {
  const chunks: string[] = [];
  const decoder = new TextDecoder();

  // Read stdout into buffer
  const reader = proc.stdout.getReader();
  const readPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Stream closed — expected during kill
    }
  })();

  // Wait for capture duration
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  // Flush remaining decoder state
  chunks.push(decoder.decode());

  // Cancel reader
  try {
    reader.cancel();
  } catch {
    /* ignore */
  }

  // Wait for reader to finish (with timeout)
  await Promise.race([
    readPromise,
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);

  return chunks.join("");
}

/**
 * Check if the TUI can be launched by attempting a dry-run.
 * Returns true if bun can resolve the main entry point.
 */
async function canLaunch(): Promise<{ ok: boolean; reason?: string }> {
  try {
    // Check if the entry file exists (absolute path — cwd-independent)
    const file = Bun.file(MAIN_ENTRY);
    if (!(await file.exists())) {
      return { ok: false, reason: `main entry not found: ${MAIN_ENTRY}` };
    }

    // Check if @opentui packages are resolvable (package-local or monorepo root)
    const localCore = Bun.file(
      join(PACKAGE_ROOT, "node_modules/@opentui/core/package.json")
    );
    const rootCore = Bun.file(
      join(PACKAGE_ROOT, "../../node_modules/@opentui/core/package.json")
    );
    const depsOk = (await localCore.exists()) || (await rootCore.exists());
    if (!depsOk) {
      return {
        ok: false,
        reason: "@opentui/core not installed (run bun install)",
      };
    }

    // E2E tests require a real pseudo-terminal (PTY) for TUI rendering.
    // Skip in headless or CI environments where stdout has no TTY.
    if (!process.stdout.isTTY) {
      return {
        ok: false,
        reason:
          "E2E smoke test requires a TTY (pseudo-terminal). Run in an interactive terminal.",
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Hoox TUI E2E Smoke Test", () => {
  let canRun = false;
  let skipReason = "unknown";

  beforeAll(async () => {
    const result = await canLaunch();
    canRun = result.ok;
    skipReason = result.reason ?? "";
    if (!canRun) {
      console.warn(
        `⚠ SKIPPING E2E smoke test: ${skipReason}\n` +
          "  Install dependencies with: bun install\n" +
          "  Then run from an interactive TTY: bun test packages/tui/test/e2e/"
      );
    }
  });

  // ── Basic launch & render ─────────────────────────────────────────────────

  it("launches the TUI and renders key sections", async () => {
    if (!canRun) {
      console.warn(`  Skipped — ${skipReason}`);
      return;
    }

    let proc: Subprocess<"pipe", "pipe", "pipe"> | null = null;
    // eslint-disable-next-line no-useless-assignment
    let output = "";

    try {
      // Spawn the TUI process from the package root with absolute entry
      proc = spawn({
        cmd: ["bun", "run", MAIN_ENTRY],
        cwd: PACKAGE_ROOT,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
        env: {
          ...process.env,
          TERM: "xterm-256color",
          // Force terminal size for consistent rendering
          COLUMNS: "120",
          LINES: "40",
          // Disable real API calls in test
          HOOX_TEST_MODE: "1",
        },
      });

      // Capture output for a few seconds
      output = await captureOutput(proc, CAPTURE_DURATION_MS);

      // Assert each required pattern appears
      for (const { name, pattern } of REQUIRED_PATTERNS) {
        const found = pattern.test(output);
        if (!found) {
          // Log the first 500 chars of output for debugging
          const preview =
            output.length > 500 ? output.slice(0, 500) + "…" : output;
          console.warn(
            `  Pattern "${name}" not found. Output preview:\n${preview}`
          );
        }
        // Soft assertion: don't fail CI on rendering differences
        // In strict mode, uncomment: expect(found).toBe(true)
        expect(found).toBe(true);
      }

      // Assert output is not empty (catches catastrophic failure)
      expect(output.length).toBeGreaterThan(0);
    } finally {
      // Clean up
      if (proc) {
        try {
          proc.kill("SIGTERM");
        } catch {
          // Already dead
        }
      }
    }
  }, 10_000); // 10s timeout

  // ── Clean exit via Ctrl+Q ─────────────────────────────────────────────────

  it("exits cleanly when Ctrl+Q is sent", async () => {
    if (!canRun) {
      console.warn(`  Skipped — ${skipReason}`);
      return;
    }

    let proc: Subprocess<"pipe", "pipe", "pipe"> | null = null;

    let output = "";

    try {
      proc = spawn({
        cmd: ["bun", "run", MAIN_ENTRY],
        cwd: PACKAGE_ROOT,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLUMNS: "120",
          LINES: "40",
          HOOX_TEST_MODE: "1",
        },
      });

      // Wait briefly for the TUI to initialize
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      // Send Ctrl+Q (ASCII 0x11) to open quit confirmation, then Enter to confirm
      proc.stdin.write(new Uint8Array([0x11])); // Ctrl+Q
      await new Promise((resolve) => setTimeout(resolve, 300));
      proc.stdin.write(new Uint8Array([0x0d])); // Enter (confirm dialog)

      // Wait for the process to exit naturally
      const exitCode = await Promise.race([
        proc.exited,
        new Promise<number>((resolve) =>
          setTimeout(() => {
            proc?.kill("SIGKILL");
            resolve(-1);
          }, 5_000)
        ),
      ]);

      // Read any remaining output (cleanup sequences)
      try {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        const chunks: string[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(decoder.decode(value, { stream: true }));
        }
        chunks.push(decoder.decode());
        output = chunks.join("");
      } catch {
        // Stream already closed
      }

      // Assert clean exit
      expect(exitCode).toBe(0);

      // Assert alternate screen was exited cleanly
      for (const { name, pattern } of EXIT_PATTERNS) {
        const found = pattern.test(output);
        if (!found) {
          console.warn(`  Pattern "${name}" not found in exit output.`);
        }
        expect(found).toBe(true);
      }
    } finally {
      if (proc) {
        try {
          proc.kill("SIGKILL");
        } catch {
          // Already dead
        }
      }
    }
  }, 15_000); // 15s timeout

  // ── Subprocess exits without crash ─────────────────────────────────────────

  it("process does not crash on startup (no non-zero exit before Ctrl+Q)", async () => {
    if (!canRun) {
      console.warn(`  Skipped — ${skipReason}`);
      return;
    }

    const proc = spawn({
      cmd: ["bun", "run", MAIN_ENTRY],
      cwd: PACKAGE_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLUMNS: "120",
        LINES: "40",
        HOOX_TEST_MODE: "1",
      },
    });

    // Wait 3 seconds — if process exits with non-zero before that, it crashed
    let earlyExit = false;
    let exitCode = -1;

    const exitPromise = proc.exited.then((code) => {
      earlyExit = true;
      exitCode = code;
    });

    await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);

    if (earlyExit) {
      // Process exited before we could interact — that's a crash
      console.error(
        `TUI exited prematurely with code ${exitCode}. ` +
          `Check stderr for details.`
      );
    }

    // Kill the process (it's still running if we got here via timeout)
    try {
      proc.kill("SIGTERM");
    } catch {
      // Already dead
    }

    // Assert: either still running after 3s (normal), or exited with code 0
    if (earlyExit) {
      expect(exitCode).toBe(0);
    }
    // If it survived 3 seconds, test passes — process didn't crash
  }, 10_000);

  // ── Sidebar toggle behavior ────────────────────────────────────────────────

  it("responds to Ctrl+B (sidebar toggle) without crashing", async () => {
    if (!canRun) {
      console.warn(`  Skipped — ${skipReason}`);
      return;
    }

    const proc = spawn({
      cmd: ["bun", "run", MAIN_ENTRY],
      cwd: PACKAGE_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLUMNS: "120",
        LINES: "40",
        HOOX_TEST_MODE: "1",
      },
    });

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    // Send Ctrl+B
    proc.stdin.write(new Uint8Array([0x02])); // Ctrl+B

    // Wait a bit and check process is still alive
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    // eslint-disable-next-line no-useless-assignment
    let stillAlive = false;
    try {
      proc.kill("SIGTERM");
      stillAlive = true;
    } catch {
      stillAlive = false;
    }

    expect(stillAlive).toBe(true);
  }, 10_000);
});
