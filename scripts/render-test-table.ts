#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Render a JUnit XML test report as a unified per-suite summary table.
 *
 * Usage:
 *   bun run scripts/render-test-table.ts                       # default: ./reports/junit.xml
 *   bun run scripts/render-test-table.ts path/to/junit.xml     # explicit path
 *
 * This is the manual escape hatch — the same table is auto-rendered at
 * the end of every `bun test` run via the `process.on('exit')` hook
 * registered in `packages/test-utils/src/setup.ts`. This script is
 * useful for re-rendering after the fact, inspecting CI artifacts, or
 * rendering reports from a different directory.
 */
import { existsSync, readFileSync } from "node:fs";
import { renderTestTable } from "../packages/test-utils/src/render-test-table.ts";

const targetPath = process.argv[2] ?? "./reports/junit.xml";

if (!existsSync(targetPath)) {
  console.error(`JUnit report not found: ${targetPath}`);
  process.exit(1);
}

const xml = readFileSync(targetPath, "utf-8");
if (!xml.trim()) {
  console.error(`JUnit report is empty: ${targetPath}`);
  process.exit(1);
}

process.stdout.write(`\n${renderTestTable(xml)}\n`);
