/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Build script for @jango-blockchained/hoox-shared.
 *
 * Produces:
 *   dist/    — Compiled .js files via `bun build` with code splitting
 *   dist/    — Declaration .d.ts + .d.ts.map files via `tsc --declaration`
 *
 * Entry points are all non-test .ts files in src/ that correspond to
 * public subpath exports in package.json.
 */

import { $ } from "bun";
import { existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SRC = resolve(ROOT, "src");
const DIST = resolve(ROOT, "dist");

// Clean previous build
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true, force: true });
}

// ── Gather entry points ──────────────────────────────────────────────────
// Walk src/ recursively to find all .ts files, filter out test files,
// and include only the files that are public entry points.

const testPattern = /\.test\.ts$/;
const testDirPattern = /[/\\]__tests__[/\\]/;

function walk(dir: string, base: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const rel = relative(base, full);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules" && !entry.startsWith(".")) {
        results.push(...walk(full, base));
      }
    } else if (
      entry.endsWith(".ts") &&
      !testPattern.test(entry) &&
      !testDirPattern.test(rel)
    ) {
      results.push(rel);
    }
  }
  return results;
}

// Subdirectories whose non-index files are published as deep imports
// (e.g. `<pkg>/middleware/auth`). These must mirror the `./<sub>/*` entries
// in package.json's `exports` map. `index.ts` is covered by `subIndex` below
// and doesn't need to be listed here.
const DEEP_IMPORT_SUBDIRS = [
  "middleware",
  "d1",
  "schemas",
  "wizard",
  "exchanges",
] as const;

const allFiles = walk(SRC, ROOT);
const entries = allFiles
  .filter((f) => {
    // Include: top-level src/*.ts, subdirectory index.ts, stores/*.ts, types/*.ts,
    // and every non-index .ts in subdirs that declare a `<sub>/*` exports pattern.
    const topLevel = /^src\/[^/]+\.ts$/.test(f);
    const subIndex = /^src\/[^/]+\/index\.ts$/.test(f);
    const storeFiles = /^src\/stores\/.+\.ts$/.test(f);
    const typeFiles = /^src\/types\/.+\.ts$/.test(f);
    const deepImportSubmodule = DEEP_IMPORT_SUBDIRS.some((sub) =>
      new RegExp(`^src/${sub}/(?!index\\.ts$).+\\.ts$`).test(f)
    );
    return (
      topLevel || subIndex || storeFiles || typeFiles || deepImportSubmodule
    );
  })
  .sort();

console.log(`\n  Building ${entries.length} entry points:\n`);
for (const e of entries) {
  console.log(`    ${e}`);
}

// ── Step 1: bun build (JS output) ───────────────────────────────────────

const { exitCode: buildExit } = await $`
  bun build \
    ${entries} \
    --outdir ./dist \
    --target bun \
    --format esm \
    --root ./src \
    --external @jango-blockchained/hoox-shared \
    --external zod \
    --external zustand \
    --external immer \
    --external jsonc-parser
`
  .cwd(ROOT)
  .nothrow();

if (buildExit !== 0) {
  console.error("\n  ✗ bun build failed");
  process.exit(1);
}

console.log(`\n  ✓ bun build complete`);

// ── Step 2: tsc declarations ────────────────────────────────────────────
// tsc emits declarations even on type errors — we warn but don't fail so
// consumers still get .d.ts files. Pre-existing type issues in source code
// don't block the build.

const { exitCode: tscExit } =
  await $`tsc -p tsconfig.build.json --declaration --emitDeclarationOnly`
    .cwd(ROOT)
    .nothrow();

if (tscExit !== 0) {
  console.warn(
    `\n  ⚠ tsc reported type errors (exit ${tscExit}) — declarations still generated`
  );
} else {
  console.log(`  ✓ declarations generated`);
}

console.log(`\n  ✓ Build complete — output in dist/\n`);
