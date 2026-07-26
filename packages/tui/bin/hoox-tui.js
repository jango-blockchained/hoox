#!/usr/bin/env bun
/**
 * Hoox TUI binary entry point.
 *
 * Resolution order (first match wins):
 *   1. `../dist/main.js`  — bundled output from `bun run build`
 *   2. `../src/main.tsx`  — monorepo / bun link dev path
 *   3. Clear error with install/build instructions
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, "..", "dist", "main.js");
const srcEntry = resolve(here, "..", "src", "main.tsx");

if (existsSync(distEntry)) {
  await import(distEntry);
} else if (existsSync(srcEntry)) {
  await import(srcEntry);
} else {
  console.error(
    `hoox-tui: could not find an entry point. Looked for:\n` +
      `  - ${distEntry}\n` +
      `  - ${srcEntry}\n\n` +
      `Install the package: bun add -g @jango-blockchained/hoox-tui\n` +
      `Or from the monorepo: cd packages/tui && bun run build`
  );
  process.exit(1);
}
