#!/usr/bin/env bun
/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Hoox CLI binary entry point.
 *
 * Resolution order (first match wins):
 *   1. `../dist/index.js`  — bundled output from `bun run build`
 *   2. `../src/index.ts`   — dev mode (run from a fresh `bun install` without
 *                            running the build first; Bun compiles TS on import)
 *   3. Clear error message instructing the user to run `bun run build`
 *
 * The dev fallback lets contributors and CI jobs that haven't yet run
 * `bun run build` still execute the CLI directly via `bun bin/hoox.js` or
 * `hoox` after a `bun link`.
 *
 * When both exist and `src/` is newer than `dist/`, a one-line stderr warning
 * is printed (unless HOOX_CLI_SILENT=1). Set HOOX_CLI_SRC=1 to force source.
 *
 * `main` is exported from `src/index.ts` so we can call it explicitly —
 * the `import.meta.main` guard inside that file would otherwise be false
 * when the module is loaded as a side effect from here.
 */

import { existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, "..", "dist", "index.js");
const srcEntry = resolve(here, "..", "src", "index.ts");
const srcRoot = resolve(here, "..", "src");

/** Newest mtime (ms) under dir for .ts/.tsx files (shallow walk, capped). */
function newestSrcMtime(dir, depth = 0) {
  if (depth > 6 || !existsSync(dir)) return 0;
  let newest = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      newest = Math.max(newest, newestSrcMtime(p, depth + 1));
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      try {
        newest = Math.max(newest, statSync(p).mtimeMs);
      } catch {
        // ignore
      }
    }
  }
  return newest;
}

async function loadAndRun(entry) {
  // Bun caches imports; the first import wins for the lifetime of the
  // process. The dist build and the source file are the same module
  // logically, so a second entry would be a no-op.
  const mod = await import(entry);
  if (typeof mod.main === "function") {
    await mod.main();
  }
}

const forceSrc = process.env.HOOX_CLI_SRC === "1";
const silent = process.env.HOOX_CLI_SILENT === "1";

if (forceSrc && existsSync(srcEntry)) {
  await loadAndRun(srcEntry);
} else if (existsSync(distEntry)) {
  // Warn when source is newer than the bundle (common monorepo gotcha).
  if (!silent && existsSync(srcEntry)) {
    try {
      const distM = statSync(distEntry).mtimeMs;
      const srcM = Math.max(
        statSync(srcEntry).mtimeMs,
        newestSrcMtime(srcRoot)
      );
      if (srcM > distM + 1000) {
        process.stderr.write(
          "hoox: warning: packages/cli/src is newer than dist/ — " +
            "run `bun run build` in packages/cli (or HOOX_CLI_SRC=1 for source).\n"
        );
      }
    } catch {
      // ignore mtime issues
    }
  }
  await loadAndRun(distEntry);
} else if (existsSync(srcEntry)) {
  // Dev path — Bun transpiles on the fly. Useful for `bun link` and CI
  // smoke tests that run before the build step.
  await loadAndRun(srcEntry);
} else {
  console.error(
    `hoox: could not find an entry point. Looked for:\n` +
      `  - ${distEntry}\n` +
      `  - ${srcEntry}\n\n` +
      `Run \`bun run build\` in packages/cli/ to produce the bundled dist/, ` +
      `or install from source so src/index.ts is present.`
  );
  process.exit(1);
}
