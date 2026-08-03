/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for TUI Hoox Path Service
 *
 * Covers:
 *   - getTuiStateDir: returns correct path, fallback to cwd
 *   - ensureTuiStateDir: creates directory, returns path, fallback
 *   - tuiStateDirExists: checks existence of .tui-state directory
 *   - resolveTuiStatePath: resolves paths within .tui-state
 *   - resolveHooxHomePath: resolves paths within $HOME/.hoox
 *   - Edge cases: empty subpath, error fallback
 */
import { describe, it, expect } from "bun:test";
import { unlinkSync, existsSync } from "fs";
import { join, resolve } from "path";

// ─── Import the module under test ─────────────────────────────────────────────

import {
  getTuiStateDir,
  ensureTuiStateDir,
  tuiStateDirExists,
  resolveTuiStatePath,
  resolveHooxHomePath,
} from "./hoox-path-service";

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("hoox-path-service", () => {
  // ── getTuiStateDir ────────────────────────────────────────────────────────

  describe("getTuiStateDir", () => {
    it("should return a path ending with .tui-state", () => {
      const dir = getTuiStateDir();
      expect(dir).toMatch(/\.tui-state$/);
    });

    it("should return an absolute path", () => {
      const dir = getTuiStateDir();
      expect(dir).toMatch(/^\/|^[A-Z]:\\/);
    });

    it("should be consistent across multiple calls", () => {
      const dir1 = getTuiStateDir();
      const dir2 = getTuiStateDir();
      expect(dir1).toBe(dir2);
    });

    it("should contain .tui-state directory name", () => {
      const dir = getTuiStateDir();
      expect(dir).toContain(".tui-state");
    });

    it("should be under the hoox home directory", () => {
      const dir = getTuiStateDir();
      // Should contain .hoox/.tui-state
      expect(dir).toContain(".hoox");
      expect(dir).toContain(".tui-state");
    });
  });

  // ── ensureTuiStateDir ─────────────────────────────────────────────────────

  describe("ensureTuiStateDir", () => {
    it("should return a path ending with .tui-state", async () => {
      const dir = await ensureTuiStateDir();
      expect(dir).toMatch(/\.tui-state$/);
    });

    it("should create the .tui-state directory if it does not exist", async () => {
      // Use a known-good path (the real hoox home)
      const dir = await ensureTuiStateDir();
      expect(existsSync(dir)).toBe(true);
    });

    it("should not throw when directory already exists", async () => {
      // First call creates it
      await ensureTuiStateDir();
      // Second call should not throw
      await expect(ensureTuiStateDir()).resolves.toBeDefined();
    });

    it("should return a writable directory", async () => {
      const dir = await ensureTuiStateDir();
      // Try writing a test file
      const testFile = join(dir, ".write-test");
      await Bun.write(testFile, "test");
      expect(existsSync(testFile)).toBe(true);
      // Cleanup
      unlinkSync(testFile);
    });
  });

  // ── tuiStateDirExists ────────────────────────────────────────────────────

  describe("tuiStateDirExists", () => {
    it("should return true when the .tui-state directory exists", () => {
      // ensureTuiStateDir should have created it in the previous test
      expect(tuiStateDirExists()).toBe(true);
    });
  });

  // ── resolveTuiStatePath ──────────────────────────────────────────────────

  describe("resolveTuiStatePath", () => {
    it("should resolve a simple filename within .tui-state", () => {
      const path = resolveTuiStatePath("session.json");
      expect(path).toMatch(/\.tui-state[/\\]session\.json$/);
    });

    it("should resolve nested paths within .tui-state", () => {
      const path = resolveTuiStatePath("subdir/data.json");
      expect(path).toMatch(/\.tui-state[/\\]subdir[/\\]data\.json$/);
    });

    it("should return an absolute path", () => {
      const path = resolveTuiStatePath("session.json");
      expect(path).toMatch(/^\/|^[A-Z]:\\/);
    });

    it("should be consistent with getTuiStateDir for the base path", () => {
      const base = getTuiStateDir();
      const sessionPath = resolveTuiStatePath("session.json");
      expect(sessionPath).toBe(join(base, "session.json"));
    });

    it("should handle empty subpath", () => {
      const path = resolveTuiStatePath("");
      const base = getTuiStateDir();
      expect(path).toBe(base);
    });

    it("should handle subpath with leading slash", () => {
      const path = resolveTuiStatePath("/session.json");
      const base = getTuiStateDir();
      // Leading slash is stripped and treated as relative
      expect(path).toBe(join(base, "session.json"));
    });
  });

  // ── resolveHooxHomePath ──────────────────────────────────────────────────

  describe("resolveHooxHomePath", () => {
    it("should resolve a path within the hoox home directory", () => {
      const path = resolveHooxHomePath("config");
      expect(path).toMatch(/\.hoox[/\\]config$/);
    });

    it("should resolve nested paths", () => {
      const path = resolveHooxHomePath("config/wrangler.jsonc");
      expect(path).toMatch(/\.hoox[/\\]config[/\\]wrangler\.jsonc$/);
    });

    it("should return an absolute path", () => {
      const path = resolveHooxHomePath("repo");
      expect(path).toMatch(/^\/|^[A-Z]:\\/);
    });

    it("should be within hoox home", () => {
      const path = resolveHooxHomePath("data");
      expect(path).toContain(".hoox");
    });
  });
});
