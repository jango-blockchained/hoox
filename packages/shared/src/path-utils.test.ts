/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for path-utils module
 *
 * Tests cross-OS path resolution, type safety, and edge cases.
 */

import { describe, it, expect, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getHooxHome,
  resolveHooxPath,
  isWithinHooxHome,
  getRelativeHooxPath,
  getHooxRepoPath,
  getHooxConfigDir,
  getHooxDataDir,
  getHooxWranglerPath,
  getHooxStatePath,
  isHooxSetupRoot,
  findHooxSetupRoot,
  resolveHooxRuntimeRoot,
  getTuiEntryCandidates,
  type HooxPath,
} from "./path-utils";

function makeFakeSetupRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "hoox-setup-"));
  writeFileSync(join(root, "wrangler.jsonc"), "{}\n");
  mkdirSync(join(root, "packages", "cli"), { recursive: true });
  writeFileSync(
    join(root, "packages", "cli", "package.json"),
    JSON.stringify({ name: "@jango-blockchained/hoox-cli" })
  );
  mkdirSync(join(root, "packages", "tui", "src"), { recursive: true });
  writeFileSync(join(root, "packages", "tui", "src", "main.tsx"), "// tui\n");
  return root;
}

describe("path-utils - Path Resolution Service", () => {
  describe("getHooxHome", () => {
    it("should return a path ending with .hoox", () => {
      const home = getHooxHome();
      expect(home).toMatch(/.hoox$/);
    });

    it("should return an absolute path", () => {
      const home = getHooxHome();
      expect(home).toMatch(/^\/|^[A-Z]:\\/); // Unix or Windows absolute path
    });

    it("should be consistent across multiple calls", () => {
      const home1 = getHooxHome();
      const home2 = getHooxHome();
      expect(home1).toBe(home2);
    });

    it("should contain .hoox directory name", () => {
      const home = getHooxHome();
      expect(home).toContain(".hoox");
    });

    it("should handle missing HOME gracefully", () => {
      // Temporarily unset HOME so os.homedir() triggers its fallback
      const origHome = process.env.HOME;
      const origHooxHome = process.env.HOOX_HOME;
      try {
        delete process.env.HOME;
        delete process.env.HOOX_HOME;
        // Should not throw and return a fallback path
        expect(() => getHooxHome()).not.toThrow();
      } finally {
        if (origHome !== undefined) process.env.HOME = origHome;
        else delete process.env.HOME;
        if (origHooxHome !== undefined) process.env.HOOX_HOME = origHooxHome;
        else delete process.env.HOOX_HOME;
      }
    });

    it("should prefer HOOX_HOME when set", () => {
      const orig = process.env.HOOX_HOME;
      const custom = join(tmpdir(), "custom-hoox-home");
      try {
        process.env.HOOX_HOME = custom;
        expect(getHooxHome() as string).toBe(join(custom));
      } finally {
        if (orig !== undefined) process.env.HOOX_HOME = orig;
        else delete process.env.HOOX_HOME;
      }
    });
  });

  describe("isHooxSetupRoot / findHooxSetupRoot", () => {
    const temps: string[] = [];
    afterEach(() => {
      for (const t of temps) {
        try {
          rmSync(t, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      temps.length = 0;
    });

    it("returns false for empty or random dirs", () => {
      expect(isHooxSetupRoot("")).toBe(false);
      const d = mkdtempSync(join(tmpdir(), "not-hoox-"));
      temps.push(d);
      expect(isHooxSetupRoot(d)).toBe(false);
    });

    it("detects a fake setup root and walks up from nested cwd", () => {
      const root = makeFakeSetupRoot();
      temps.push(root);
      expect(isHooxSetupRoot(root)).toBe(true);
      const nested = join(root, "packages", "tui", "src");
      expect(findHooxSetupRoot(nested)).toBe(root);
    });

    it("returns null when walking from a non-repo path", () => {
      const d = mkdtempSync(join(tmpdir(), "outside-"));
      temps.push(d);
      expect(findHooxSetupRoot(d)).toBeNull();
    });
  });

  describe("resolveHooxRuntimeRoot", () => {
    const temps: string[] = [];
    const origRepo = process.env.HOOX_REPO;
    const origHome = process.env.HOOX_HOME;
    afterEach(() => {
      if (origRepo !== undefined) process.env.HOOX_REPO = origRepo;
      else delete process.env.HOOX_REPO;
      if (origHome !== undefined) process.env.HOOX_HOME = origHome;
      else delete process.env.HOOX_HOME;
      for (const t of temps) {
        try {
          rmSync(t, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      temps.length = 0;
    });

    it("prefers HOOX_REPO when it is a valid setup root", () => {
      const root = makeFakeSetupRoot();
      temps.push(root);
      const outside = mkdtempSync(join(tmpdir(), "outside-"));
      temps.push(outside);
      const result = resolveHooxRuntimeRoot({
        cwd: outside,
        env: { HOOX_REPO: root },
      });
      expect(result.source).toBe("env");
      expect(result.root).toBe(root);
    });

    it("returns source env with null root when HOOX_REPO is invalid", () => {
      const outside = mkdtempSync(join(tmpdir(), "outside-"));
      temps.push(outside);
      const bad = join(outside, "missing");
      const result = resolveHooxRuntimeRoot({
        cwd: outside,
        env: { HOOX_REPO: bad },
      });
      expect(result.source).toBe("env");
      expect(result.root).toBeNull();
      expect(result.checked.env).toBe(join(bad));
    });

    it("finds monorepo from cwd when HOOX_REPO is unset", () => {
      const root = makeFakeSetupRoot();
      temps.push(root);
      const result = resolveHooxRuntimeRoot({
        cwd: join(root, "packages"),
        env: {},
      });
      expect(result.source).toBe("cwd");
      expect(result.root).toBe(root);
    });

    it("uses global ~/.hoox/repo when cwd is not a setup repo", () => {
      const base = mkdtempSync(join(tmpdir(), "hoox-home-"));
      temps.push(base);
      const repo = join(base, "repo");
      mkdirSync(join(repo, "packages", "cli"), { recursive: true });
      writeFileSync(join(repo, "wrangler.jsonc"), "{}\n");
      writeFileSync(
        join(repo, "packages", "cli", "package.json"),
        JSON.stringify({ name: "cli" })
      );

      const outside = mkdtempSync(join(tmpdir(), "outside-"));
      temps.push(outside);

      process.env.HOOX_HOME = base;
      delete process.env.HOOX_REPO;

      const result = resolveHooxRuntimeRoot({ cwd: outside, env: {} });
      // env arg empty doesn't include HOOX_HOME — getHooxRepoPath reads process.env
      expect(result.source).toBe("global");
      expect(result.root).toBe(repo);
    });

    it("returns none when nothing matches", () => {
      const base = mkdtempSync(join(tmpdir(), "empty-hoox-"));
      temps.push(base);
      const outside = mkdtempSync(join(tmpdir(), "outside-"));
      temps.push(outside);
      process.env.HOOX_HOME = base;
      delete process.env.HOOX_REPO;
      const result = resolveHooxRuntimeRoot({ cwd: outside, env: {} });
      expect(result.source).toBe("none");
      expect(result.root).toBeNull();
      expect(result.checked.global).toBe(join(base, "repo"));
    });
  });

  describe("getTuiEntryCandidates", () => {
    it("lists source and dist main under packages/tui", () => {
      const candidates = getTuiEntryCandidates("/tmp/hoox-setup");
      expect(candidates[0]).toMatch(/packages[/\\]tui[/\\]src[/\\]main\.tsx$/);
      expect(candidates[1]).toMatch(/packages[/\\]tui[/\\]dist[/\\]main\.js$/);
    });
  });

  describe("resolveHooxPath", () => {
    it("should resolve a simple relative path", () => {
      const path = resolveHooxPath("repo");
      expect(path).toMatch(/\.hoox[/\\]repo$/);
    });

    it("should resolve nested relative paths", () => {
      const path = resolveHooxPath("config/wrangler.jsonc");
      expect(path).toMatch(/\.hoox[/\\]config[/\\]wrangler\.jsonc$/);
    });

    it("should return an absolute path", () => {
      const path = resolveHooxPath("repo");
      expect(path).toMatch(/^\/|^[A-Z]:\\/);
    });

    it("should reject path traversal attempts", () => {
      expect(() => resolveHooxPath("../etc/passwd")).toThrow(
        /Path traversal detected/
      );
    });

    it("should reject empty relative path", () => {
      expect(() => resolveHooxPath("")).toThrow(/non-empty string/);
    });

    it("should reject non-string input", () => {
      expect(() => resolveHooxPath(null as any)).toThrow(/non-empty string/);
      expect(() => resolveHooxPath(undefined as any)).toThrow(
        /non-empty string/
      );
    });

    it("should reject paths that escape hoox home", () => {
      // This is a security check — paths should not escape the hoox directory
      const maliciousPath = "../../../../../../etc/passwd";
      expect(() => resolveHooxPath(maliciousPath)).toThrow();
    });

    it("should handle paths with multiple segments", () => {
      const path = resolveHooxPath("data/trades/2026-06-08.json");
      expect(path).toMatch(/\.hoox[/\\]data[/\\]trades[/\\]2026-06-08\.json$/);
    });

    it("should normalize path separators", () => {
      const path1 = resolveHooxPath("config/wrangler.jsonc");
      const path2 = resolveHooxPath("config\\wrangler.jsonc");
      // Both should resolve to the same absolute path
      expect(path1).toBe(path2);
    });
  });

  describe("isWithinHooxHome", () => {
    it("should return true for paths within hoox home", () => {
      const hooxHome = getHooxHome();
      expect(isWithinHooxHome(hooxHome)).toBe(true);
    });

    it("should return true for nested paths within hoox home", () => {
      const nestedPath = resolveHooxPath("repo/src");
      expect(isWithinHooxHome(nestedPath)).toBe(true);
    });

    it("should return false for paths outside hoox home", () => {
      expect(isWithinHooxHome("/etc/passwd")).toBe(false);
      expect(isWithinHooxHome("/tmp")).toBe(false);
    });

    it("should handle invalid paths gracefully", () => {
      expect(isWithinHooxHome("")).toBe(false);
      expect(isWithinHooxHome(null as any)).toBe(false);
      expect(isWithinHooxHome(undefined as any)).toBe(false);
    });

    it("should be case-sensitive on Unix systems", () => {
      const hooxHome = getHooxHome();
      // On Unix, .HOOX should not match .hoox
      if (!hooxHome.includes("\\")) {
        // Unix system
        const upperPath = hooxHome.replace(".hoox", ".HOOX");
        expect(isWithinHooxHome(upperPath)).toBe(false);
      }
    });
  });

  describe("getRelativeHooxPath", () => {
    it("should return relative path for paths within hoox home", () => {
      const absolutePath = resolveHooxPath("repo");
      const relative = getRelativeHooxPath(absolutePath);
      expect(relative).toBe("repo");
    });

    it("should return relative path for nested paths", () => {
      const absolutePath = resolveHooxPath("config/wrangler.jsonc");
      const relative = getRelativeHooxPath(absolutePath);
      expect(relative).toBe("config/wrangler.jsonc");
    });

    it("should return null for paths outside hoox home", () => {
      const relative = getRelativeHooxPath("/etc/passwd");
      expect(relative).toBeNull();
    });

    it("should handle hoox home itself", () => {
      const hooxHome = getHooxHome();
      const relative = getRelativeHooxPath(hooxHome);
      expect(relative).toBe("");
    });

    it("should handle invalid paths gracefully", () => {
      expect(getRelativeHooxPath("")).toBeNull();
      expect(getRelativeHooxPath(null as any)).toBeNull();
      expect(getRelativeHooxPath(undefined as any)).toBeNull();
    });

    it("should strip leading slashes", () => {
      const absolutePath = resolveHooxPath("repo");
      const relative = getRelativeHooxPath(absolutePath);
      expect(relative).not.toMatch(/^[/\\]/);
    });
  });

  describe("getHooxRepoPath", () => {
    it("should return path to repo directory", () => {
      const path = getHooxRepoPath();
      expect(path).toMatch(/\.hoox[/\\]repo$/);
    });

    it("should be within hoox home", () => {
      const path = getHooxRepoPath();
      expect(isWithinHooxHome(path)).toBe(true);
    });

    it("should be consistent across calls", () => {
      const path1 = getHooxRepoPath();
      const path2 = getHooxRepoPath();
      expect(path1).toBe(path2);
    });
  });

  describe("getHooxConfigDir", () => {
    it("should return path to config directory", () => {
      const path = getHooxConfigDir();
      expect(path).toMatch(/\.hoox[/\\]config$/);
    });

    it("should be within hoox home", () => {
      const path = getHooxConfigDir();
      expect(isWithinHooxHome(path)).toBe(true);
    });

    it("should be consistent across calls", () => {
      const path1 = getHooxConfigDir();
      const path2 = getHooxConfigDir();
      expect(path1).toBe(path2);
    });
  });

  describe("getHooxDataDir", () => {
    it("should return path to data directory", () => {
      const path = getHooxDataDir();
      expect(path).toMatch(/\.hoox[/\\]data$/);
    });

    it("should be within hoox home", () => {
      const path = getHooxDataDir();
      expect(isWithinHooxHome(path)).toBe(true);
    });

    it("should be consistent across calls", () => {
      const path1 = getHooxDataDir();
      const path2 = getHooxDataDir();
      expect(path1).toBe(path2);
    });
  });

  describe("getHooxWranglerPath", () => {
    it("should return path to wrangler.jsonc", () => {
      const path = getHooxWranglerPath();
      expect(path).toMatch(/\.hoox[/\\]config[/\\]wrangler\.jsonc$/);
    });

    it("should be within hoox home", () => {
      const path = getHooxWranglerPath();
      expect(isWithinHooxHome(path)).toBe(true);
    });

    it("should be consistent across calls", () => {
      const path1 = getHooxWranglerPath();
      const path2 = getHooxWranglerPath();
      expect(path1).toBe(path2);
    });

    it("should be within config directory", () => {
      const wranglerPath = getHooxWranglerPath();
      const configDir = getHooxConfigDir();
      expect(wranglerPath).toContain(configDir);
    });
  });

  describe("getHooxStatePath", () => {
    it("should return path to state.json", () => {
      const path = getHooxStatePath();
      expect(path).toMatch(/\.hoox[/\\]data[/\\]state\.json$/);
    });

    it("should be within hoox home", () => {
      const path = getHooxStatePath();
      expect(isWithinHooxHome(path)).toBe(true);
    });

    it("should be consistent across calls", () => {
      const path1 = getHooxStatePath();
      const path2 = getHooxStatePath();
      expect(path1).toBe(path2);
    });

    it("should be within data directory", () => {
      const statePath = getHooxStatePath();
      const dataDir = getHooxDataDir();
      expect(statePath).toContain(dataDir);
    });
  });

  describe("Type Safety - HooxPath branded type", () => {
    it("should return HooxPath type from getHooxHome", () => {
      const path: HooxPath = getHooxHome();
      expect(typeof path).toBe("string");
    });

    it("should return HooxPath type from resolveHooxPath", () => {
      const path: HooxPath = resolveHooxPath("repo");
      expect(typeof path).toBe("string");
    });

    it("should return HooxPath type from helper functions", () => {
      const paths: HooxPath[] = [
        getHooxRepoPath(),
        getHooxConfigDir(),
        getHooxDataDir(),
        getHooxWranglerPath(),
        getHooxStatePath(),
      ];
      expect(paths.length).toBe(5);
      paths.forEach((p) => {
        expect(typeof p).toBe("string");
      });
    });
  });

  describe("Cross-OS Compatibility", () => {
    it("should work with Unix-style paths", () => {
      const path = resolveHooxPath("repo");
      // Should be a valid absolute path
      expect(path).toMatch(/^\/|^[A-Z]:\\/);
    });

    it("should handle path separators correctly", () => {
      const path = resolveHooxPath("config/wrangler.jsonc");
      // Should contain proper path separators for the OS
      expect(path).toContain("config");
      expect(path).toContain("wrangler.jsonc");
    });

    it("should normalize mixed separators", () => {
      const path1 = resolveHooxPath("config/data");
      const path2 = resolveHooxPath("config\\data");
      expect(path1).toBe(path2);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle whitespace in paths", () => {
      const path = resolveHooxPath("my config");
      expect(path).toContain("my config");
    });

    it("should handle special characters in paths", () => {
      const path = resolveHooxPath("data-2026-06-08");
      expect(path).toContain("data-2026-06-08");
    });

    it("should reject multiple consecutive dots", () => {
      expect(() => resolveHooxPath("...")).toThrow();
    });

    it("should handle very long paths", () => {
      const longPath = "a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z";
      const path = resolveHooxPath(longPath);
      expect(path).toContain("a");
      expect(path).toContain("z");
    });

    it("should be idempotent for resolveHooxPath", () => {
      const path1 = resolveHooxPath("repo");
      const path2 = resolveHooxPath("repo");
      expect(path1).toBe(path2);
    });
  });

  describe("Integration Tests", () => {
    it("should construct valid directory hierarchy", () => {
      const home = getHooxHome();
      const repo = getHooxRepoPath();
      const config = getHooxConfigDir();
      const data = getHooxDataDir();

      // All should be within home
      expect(isWithinHooxHome(repo)).toBe(true);
      expect(isWithinHooxHome(config)).toBe(true);
      expect(isWithinHooxHome(data)).toBe(true);

      // All should start with home
      expect(repo).toContain(home);
      expect(config).toContain(home);
      expect(data).toContain(home);
    });

    it("should support round-trip path conversion", () => {
      const absolutePath = resolveHooxPath("config/wrangler.jsonc");
      const relative = getRelativeHooxPath(absolutePath);
      const reconstructed = resolveHooxPath(relative!);

      expect(reconstructed).toBe(absolutePath);
    });

    it("should maintain path consistency across all helpers", () => {
      const home = getHooxHome();
      const repo = getHooxRepoPath();
      const config = getHooxConfigDir();
      const data = getHooxDataDir();
      const wrangler = getHooxWranglerPath();
      const state = getHooxStatePath();

      // All should be strings
      expect(typeof home).toBe("string");
      expect(typeof repo).toBe("string");
      expect(typeof config).toBe("string");
      expect(typeof data).toBe("string");
      expect(typeof wrangler).toBe("string");
      expect(typeof state).toBe("string");

      // All should be absolute
      expect(home).toMatch(/^\/|^[A-Z]:\\/);
      expect(repo).toMatch(/^\/|^[A-Z]:\\/);
      expect(config).toMatch(/^\/|^[A-Z]:\\/);
      expect(data).toMatch(/^\/|^[A-Z]:\\/);
      expect(wrangler).toMatch(/^\/|^[A-Z]:\\/);
      expect(state).toMatch(/^\/|^[A-Z]:\\/);
    });
  });
});
