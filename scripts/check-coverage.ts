#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Per-file coverage gate for `packages/cli/`.
 *
 * Usage:
 *   bun run scripts/check-coverage.ts                      # default: packages/cli/coverage/lcov.info
 *   bun run scripts/check-coverage.ts path/to/lcov.info    # explicit path
 *
 * Exits 0 if every file in packages/cli/src/ (excluding tests, barrel
 * `index.ts` re-exports, and files < 10 source lines) meets the
 * per-file line-coverage threshold. Prints a sorted table of offenders
 * otherwise and exits 1.
 *
 * The threshold is intentionally set to 50% today — it catches the
 * "essentially untested" files (telegram-service 1.47%, repair-service
 * 2.48%, cli-provisioner 12.96%, env-command 23.56%, etc.) and gives
 * the well-tested files (>80%) headroom to grow. Raise it as more
 * files get coverage.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const LCOV_PATH = process.argv[2] ?? resolve("coverage/lcov.info");
const THRESHOLD = 0.5; // 50% line coverage floor
const MIN_LINES = 10; // skip files with < 10 source lines (trivially small)

if (!existsSync(LCOV_PATH)) {
  console.error(`lcov.info not found: ${LCOV_PATH}`);
  console.error(
    "Run `bun test --coverage` in packages/cli/ first, then re-run this script."
  );
  process.exit(1);
}

interface FileCov {
  path: string;
  linesFound: number;
  linesHit: number;
}

const records: FileCov[] = [];
let current: FileCov | null = null;

const lcov = readFileSync(LCOV_PATH, "utf-8");

for (const line of lcov.split("\n")) {
  if (line.startsWith("SF:")) {
    current = { path: line.slice(3), linesFound: 0, linesHit: 0 };
  } else if (line.startsWith("LF:") && current) {
    current.linesFound = Number(line.slice(3));
  } else if (line.startsWith("LH:") && current) {
    current.linesHit = Number(line.slice(3));
    if (current.path) records.push(current);
    current = null;
  } else if (line === "end_of_record" && current) {
    if (current.path) records.push(current);
    current = null;
  }
}

interface Offender {
  path: string;
  pct: number;
  linesFound: number;
  linesHit: number;
}

const offenders: Offender[] = [];

for (const rec of records) {
  if (!rec.path.includes("packages/cli/src/")) continue;
  if (rec.path.endsWith(".test.ts")) continue;
  if (rec.path.endsWith("/index.ts")) continue; // barrel re-exports
  if (rec.linesFound < MIN_LINES) continue;

  const pct = rec.linesFound > 0 ? rec.linesHit / rec.linesFound : 1;
  if (pct < THRESHOLD) {
    offenders.push({
      path: rec.path.replace(/^.*\/packages\/cli\//, "packages/cli/"),
      pct,
      linesFound: rec.linesFound,
      linesHit: rec.linesHit,
    });
  }
}

if (offenders.length === 0) {
  console.log(
    `\n  ✓ Coverage gate: every packages/cli/src/ file has ≥ ${Math.round(THRESHOLD * 100)}% line coverage.\n`
  );
  process.exit(0);
}

offenders.sort((a, b) => a.pct - b.pct);

console.error(
  `\n  ✗ Coverage gate: ${offenders.length} file(s) in packages/cli/src/ are below ${Math.round(THRESHOLD * 100)}% line coverage:\n`
);

const fileW = Math.max(...offenders.map((o) => o.path.length), 30);
const header = `    ${"File".padEnd(fileW)}  ${"Lines".padStart(7)}  ${"Hit".padStart(5)}  ${"Pct".padStart(6)}`;
console.error(header);
console.error(
  `    ${"-".repeat(fileW)}  ${"-".repeat(7)}  ${"-".repeat(5)}  ${"-".repeat(6)}`
);

for (const o of offenders) {
  const pctStr = `${(o.pct * 100).toFixed(2)}%`;
  console.error(
    `    ${o.path.padEnd(fileW)}  ${String(o.linesFound).padStart(7)}  ${String(o.linesHit).padStart(5)}  ${pctStr.padStart(6)}`
  );
}

console.error(
  `\n  Add tests for these files. See .opencode/context/core/standards/test-coverage.md for the AAA pattern.\n`
);
process.exit(1);
