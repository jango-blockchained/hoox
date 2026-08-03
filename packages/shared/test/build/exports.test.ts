/**
 * Pins the invariant that deep imports of submodule files (e.g.
 * `@hoox-sh/hoox-shared/middleware/auth`) work end-to-end
 * for both dev (workspace symlink) and published (npm tarball) consumers.
 *
 * Regression test for: dashboard breaking after PR #109 changed the
 * `import` export condition from `src/*.ts` to `dist/*.js`. The wildcard
 * `*` in Node's `exports` map only matches a single segment, so
 * `<pkg>/<subdir>/<file>` was falling through with no match.
 *
 * This test enforces:
 *   1. `package.json` `exports` declares `./<subdir>/*` patterns.
 *   2. The build emits `dist/<subdir>/<file>.js` for each non-index
 *      source file in `src/<subdir>/`.
 *   3. A consumer can `import` from the deep path and get the symbol.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const SHARED_ROOT = resolve(__dirname, "../..");

// Subdirectories whose deep imports (`<subdir>/<file>`) must resolve.
// These mirror the explicit subpath entries in package.json.
const DEEP_IMPORT_SUBDIRS = [
  "middleware",
  "d1",
  "schemas",
  "wizard",
  "exchanges",
] as const;

describe("Shared package exports — deep imports", () => {
  // Schema test: fast, no build needed. Catches missing/typo'd exports.
  // Uses `in` because `toHaveProperty` is broken in bun:test when the
  // property key contains `*`.
  for (const sub of DEEP_IMPORT_SUBDIRS) {
    it(`declares './${sub}/*' pattern in package.json exports`, () => {
      const pkg = JSON.parse(
        readFileSync(join(SHARED_ROOT, "package.json"), "utf8")
      );
      expect(`./${sub}/*` in pkg.exports).toBe(true);
    });
  }

  // Build + resolution test: slower, runs `bun run build` once.
  describe("after `bun run build`", () => {
    beforeAll(() => {
      execSync("bun run build", {
        cwd: SHARED_ROOT,
        stdio: "pipe",
        timeout: 90_000,
      });
    }, 90_000);

    for (const sub of DEEP_IMPORT_SUBDIRS) {
      it(`emits dist/${sub}/<file>.js for every non-index source file`, () => {
        const srcDir = join(SHARED_ROOT, "src", sub);
        const distDir = join(SHARED_ROOT, "dist", sub);
        const srcFiles = readdirSync(srcDir).filter(
          (f) =>
            f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts")
        );
        expect(srcFiles.length).toBeGreaterThan(0);
        for (const f of srcFiles) {
          const baseName = f.replace(/\.ts$/, "");
          const jsPath = join(distDir, `${baseName}.js`);
          expect(existsSync(jsPath)).toBe(true);
        }
      });
    }

    it("resolves `@hoox-sh/hoox-shared/middleware/auth`", async () => {
      const mod = await import("@hoox-sh/hoox-shared/middleware/auth");
      expect(typeof mod.timingSafeEqual).toBe("function");
    });
  });
});
