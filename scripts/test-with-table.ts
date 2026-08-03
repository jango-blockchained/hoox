#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Test runner wrapper — invokes `bun test` with the supplied args, then
 * renders the unified per-suite summary table from the JUnit XML file
 * emitted by Bun's reporter (configured in `bunfig.toml`).
 *
 * This exists because Bun's test runner does not fire `process.on('exit')`
 * or `process.on('beforeExit')` on its fast-exit shutdown path, which
 * rules out an in-preload `exit` hook for the renderer. Spawning the
 * runner as a child and post-processing the JUnit file is the only
 * reliable default-on approach.
 *
 * Usage in package.json scripts:
 *
 *     "test":         "bun run scripts/test-with-table.ts --path-ignore-patterns 'tests/live/**'",
 *     "test:cli":     "bun run scripts/test-with-table.ts packages/cli/",
 *     "test:workers": "bun run scripts/test-with-table.ts workers/",
 *     ...
 *
 * Direct invocation:
 *
 *     bun run scripts/test-with-table.ts <bun-test-args>
 *
 * Exit code is propagated from the underlying `bun test` process so CI
 * pipelines continue to fail on test failure.
 */
import { existsSync, readFileSync } from "node:fs";
import { renderTestTable } from "../packages/test-utils/src/render-test-table.ts";

const args = process.argv.slice(2);
const junitPath = "./reports/junit.xml";

// Spawn `bun test` with the same args, inheriting stdio so live progress
// and failure output are visible to the user in real time.
// Ensure global test preload to stub dangerous external spawns is included
const PRELOAD = "./packages/test-setup-global.ts";
let bunArgs = ["bun", "test"];
const hasPreload = args.some(
  (a) => a === "--preload" || a.startsWith("--preload=")
);
if (!hasPreload) {
  bunArgs.push("--preload", PRELOAD);
}

// Detect package-/path-scoped runs (e.g. packages/cli/, workers/, tests/e2e/).
// Aggregate coverage thresholds are only meaningful for the full monorepo
// suite: scoped runs pull in lightly-covered cross-package deps and would
// fail an 80% gate even when every test passed.
const isScopedRun = args.some(
  (a) =>
    !a.startsWith("-") &&
    (a.startsWith("packages/") ||
      a.startsWith("workers/") ||
      a.startsWith("tests/") ||
      a.startsWith("pages/") ||
      a.includes(".test.") ||
      a.endsWith("/"))
);

if (!isScopedRun) {
  // Full-suite gate (aligned with historical bunfig targets).
  bunArgs.push(
    "--coverage-threshold=lines=80,statements=80,functions=80,branches=75"
  );
}

bunArgs.push(...args);

const proc = Bun.spawn(bunArgs, {
  stdio: ["inherit", "inherit", "inherit"],
});
const exitCode = await proc.exited;

// Post-process the JUnit report produced by the run.
if (existsSync(junitPath)) {
  try {
    const xml = readFileSync(junitPath, "utf-8");
    if (xml.trim()) {
      process.stdout.write(`\n${renderTestTable(xml)}\n`);
    }
  } catch {
    // Silent — a render failure must not mask the test exit code.
  }
}

// Propagate the test runner's exit code to the wrapper's caller (CI, etc.).
process.exit(exitCode ?? 0);
