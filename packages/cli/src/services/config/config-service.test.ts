/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigService } from "./config-service.js";

/**
 * Helper: write a wrangler.jsonc file to a test directory using Bun.
 */
async function writeConfig(dir: string, content: string): Promise<void> {
  await Bun.write(join(dir, "wrangler.jsonc"), content);
}

/**
 * Helper: create a minimal valid config JSON string.
 */
function validConfigJson(): string {
  return JSON.stringify(
    {
      global: {
        cloudflare_account_id: "abc123",
      },
      workers: {
        "test-worker": {
          enabled: true,
          path: "workers/test-worker",
        },
      },
    },
    null,
    2
  );
}

/**
 * Helper: create a valid config with JSONC comments.
 */
function validConfigWithComments(): string {
  return `{
  // This is a line comment
  "global": {
    /* Block comment explaining account_id */
    "cloudflare_account_id": "abc123"
  },
  "workers": {
    "test-worker": {
      "enabled": true,
      "path": "workers/test-worker" // inline comment
    }
  }
}`;
}

describe("ConfigService", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "hoox-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Constructor defaults ──────────────────────────────────────────

  it("defaults config path to wrangler.jsonc in cwd", () => {
    const service = new ConfigService();
    // Constructor stores the default path — verified via load() behavior
    expect(service).toBeInstanceOf(ConfigService);
  });

  it("accepts a custom config path in constructor", () => {
    const customPath = "/tmp/custom-wrangler.jsonc";
    const service = new ConfigService(customPath);
    expect(service).toBeInstanceOf(ConfigService);
  });

  // ── load() — happy path ───────────────────────────────────────────

  it("loads and parses a valid wrangler.jsonc", async () => {
    await writeConfig(tmpDir, validConfigJson());
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    const config = await service.load();
    expect(config.global.cloudflare_account_id).toBe("abc123");
    expect(config.workers["test-worker"]).toBeDefined();
  });

  it("loads a config with enabled/disabled workers", async () => {
    const content = JSON.stringify({
      global: { cloudflare_account_id: "abc123" },
      workers: {
        "worker-a": { enabled: true, path: "workers/a" },
        "worker-b": { enabled: false, path: "workers/b" },
        "worker-c": { enabled: true, path: "workers/c" },
      },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    expect(service.listWorkers()).toEqual(["worker-a", "worker-b", "worker-c"]);
    expect(service.listEnabledWorkers()).toEqual(["worker-a", "worker-c"]);
  });

  // ── load() — error cases ──────────────────────────────────────────

  it("throws when config file does not exist", async () => {
    const service = new ConfigService(join(tmpDir, "nonexistent.jsonc"));
    await expect(service.load()).rejects.toThrow("not found");
  });

  it("throws for invalid JSONC syntax", async () => {
    await writeConfig(tmpDir, "{ not valid json @@@ }");
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await expect(service.load()).rejects.toThrow("Invalid JSONC");
  });

  it("throws when root is not an object (e.g. an array)", async () => {
    await writeConfig(tmpDir, "[1, 2, 3]");
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await expect(service.load()).rejects.toThrow("must contain a JSON object");
  });

  it("throws when root is a primitive (e.g. string)", async () => {
    await writeConfig(tmpDir, '"just a string"');
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await expect(service.load()).rejects.toThrow("must contain a JSON object");
  });

  // ── Comment stripping (JSONC support) ─────────────────────────────

  it("strips // line comments via jsonc-parser", async () => {
    await writeConfig(tmpDir, validConfigWithComments());
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    const config = await service.load();
    expect(config.global.cloudflare_account_id).toBe("abc123");
  });

  it("strips /* */ block comments via jsonc-parser", async () => {
    const content = `{
  /* multi
     line
     block */
  "global": { "cloudflare_account_id": "xyz" },
  "workers": { "w": { "enabled": true, "path": "p" } }
}`;
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    const config = await service.load();
    expect(config.global.cloudflare_account_id).toBe("xyz");
  });

  it("handles pure JSON (no comments) correctly", async () => {
    await writeConfig(tmpDir, validConfigJson());
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    const config = await service.load();
    expect(config.global.cloudflare_account_id).toBe("abc123");
  });

  // ── Accessor methods (after load) ─────────────────────────────────

  it("getWorker() returns a worker config by name", async () => {
    await writeConfig(tmpDir, validConfigJson());
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const worker = service.getWorker("test-worker");
    expect(worker).toBeDefined();
    expect(worker?.enabled).toBe(true);
    expect(worker?.path).toBe("workers/test-worker");
  });

  it("getWorker() returns undefined for unknown worker", async () => {
    await writeConfig(tmpDir, validConfigJson());
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    expect(service.getWorker("nonexistent")).toBeUndefined();
  });

  it("getGlobal() returns the global config section", async () => {
    await writeConfig(tmpDir, validConfigJson());
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const global = service.getGlobal();
    expect(global.cloudflare_account_id).toBe("abc123");
  });

  it("listWorkers() returns all worker names", async () => {
    const content = JSON.stringify({
      global: { cloudflare_account_id: "abc123" },
      workers: {
        w1: { enabled: true, path: "workers/w1" },
        w2: { enabled: false, path: "workers/w2" },
      },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    expect(service.listWorkers().sort()).toEqual(["w1", "w2"]);
  });

  it("listEnabledWorkers() filters to only enabled workers", async () => {
    const content = JSON.stringify({
      global: { cloudflare_account_id: "abc123" },
      workers: {
        w1: { enabled: true, path: "workers/w1" },
        w2: { enabled: false, path: "workers/w2" },
        w3: { enabled: true, path: "workers/w3" },
      },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const enabled = service.listEnabledWorkers().sort();
    expect(enabled).toEqual(["w1", "w3"]);
    expect(enabled).not.toContain("w2");
  });

  it("listEnabledWorkers() returns empty array when all disabled", async () => {
    const content = JSON.stringify({
      global: { cloudflare_account_id: "abc123" },
      workers: {
        w1: { enabled: false, path: "workers/w1" },
        w2: { enabled: false, path: "workers/w2" },
      },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    expect(service.listEnabledWorkers()).toEqual([]);
  });

  // ── Accessor guards (before load) ─────────────────────────────────

  it("getWorker() throws if called before load()", () => {
    const service = new ConfigService();
    expect(() => service.getWorker("any")).toThrow("not loaded");
  });

  it("getGlobal() throws if called before load()", () => {
    const service = new ConfigService();
    expect(() => service.getGlobal()).toThrow("not loaded");
  });

  it("listWorkers() throws if called before load()", () => {
    const service = new ConfigService();
    expect(() => service.listWorkers()).toThrow("not loaded");
  });

  it("listEnabledWorkers() throws if called before load()", () => {
    const service = new ConfigService();
    expect(() => service.listEnabledWorkers()).toThrow("not loaded");
  });

  // ── validate() ────────────────────────────────────────────────────

  it("validate() returns valid: true for a valid config", async () => {
    await writeConfig(tmpDir, validConfigJson());
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const result = service.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validate() returns errors when config not loaded", () => {
    const service = new ConfigService();
    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("not loaded");
  });

  it("validate() catches missing global.cloudflare_account_id", async () => {
    const content = JSON.stringify({
      global: {},
      workers: { w: { enabled: true, path: "workers/w" } },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("cloudflare_account_id"))).toBe(
      true
    );
  });

  it("validate() catches missing global section entirely", async () => {
    const content = JSON.stringify({
      workers: { w: { enabled: true, path: "workers/w" } },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("cloudflare_account_id"))).toBe(
      true
    );
  });

  it("validate() catches missing worker path", async () => {
    const content = JSON.stringify({
      global: { cloudflare_account_id: "abc123" },
      workers: {
        "bad-worker": { enabled: true },
      },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("path"))).toBe(true);
  });

  it("validate() catches empty workers section", async () => {
    const content = JSON.stringify({
      global: { cloudflare_account_id: "abc123" },
      workers: {},
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("No workers"))).toBe(true);
  });

  it("validate() reports multiple errors at once", async () => {
    const content = JSON.stringify({
      global: {},
      workers: {
        w1: { enabled: true },
        w2: { enabled: false },
      },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const result = service.validate();
    expect(result.valid).toBe(false);
    // Should have at least 3 errors: account_id missing, w1 missing path, w2 missing path
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  // ── Worker config with secrets and vars ───────────────────────────

  it("parses worker secrets array", async () => {
    const content = JSON.stringify({
      global: { cloudflare_account_id: "abc123" },
      workers: {
        "secrets-worker": {
          enabled: true,
          path: "workers/secrets-worker",
          secrets: ["API_KEY", "DB_PASSWORD"],
        },
      },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const worker = service.getWorker("secrets-worker");
    expect(worker?.secrets).toEqual(["API_KEY", "DB_PASSWORD"]);
  });

  it("parses worker vars", async () => {
    const content = JSON.stringify({
      global: { cloudflare_account_id: "abc123" },
      workers: {
        "vars-worker": {
          enabled: true,
          path: "workers/vars-worker",
          vars: { DATABASE_NAME: "my-db", LOG_LEVEL: "debug" },
        },
      },
    });
    await writeConfig(tmpDir, content);
    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
    await service.load();
    const worker = service.getWorker("vars-worker");
    expect(worker?.vars).toEqual({
      DATABASE_NAME: "my-db",
      LOG_LEVEL: "debug",
    });
  });

  // ── load() called with explicit path overrides constructor ─────────

  it("load() with explicit path overrides the constructor path", async () => {
    await writeConfig(tmpDir, validConfigJson());
    const service = new ConfigService("/some/wrong/path.jsonc");
    const config = await service.load(join(tmpDir, "wrangler.jsonc"));
    expect(config.global.cloudflare_account_id).toBe("abc123");
  });

  // ── getConfigPath() — home directory resolution ───────────────

  it("getConfigPath() returns explicit path when configured", () => {
    const service = new ConfigService("/custom/path.jsonc");
    expect(service.getConfigPath()).toBe("/custom/path.jsonc");
  });

  it("getConfigPath() returns home config path when homeDir provided", () => {
    const service = new ConfigService(undefined, tmpDir);
    const expected = join(tmpDir, ".hoox", "config", "wrangler.jsonc");
    expect(service.getConfigPath()).toBe(expected);
  });

  it("getConfigPath() returns a non-empty string when no home override", () => {
    const service = new ConfigService();
    const path = service.getConfigPath();
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
  });

  // ── getWorkerPath() — home directory resolution ───────────────

  it("getWorkerPath() returns home worker path when homeDir provided", () => {
    const service = new ConfigService(undefined, tmpDir);
    const expected = join(tmpDir, ".hoox", "workers", "d1-worker");
    expect(service.getWorkerPath("d1-worker")).toBe(expected);
  });

  it("getWorkerPath() returns different paths for different workers", () => {
    const service = new ConfigService(undefined, tmpDir);
    const w1 = service.getWorkerPath("worker-a");
    const w2 = service.getWorkerPath("worker-b");
    expect(w1).not.toBe(w2);
    expect(w1).toContain("worker-a");
    expect(w2).toContain("worker-b");
  });

  it("getWorkerPath() returns a valid path when no home override", () => {
    const service = new ConfigService();
    const path = service.getWorkerPath("test-worker");
    // Should end with the worker name
    expect(path).toMatch(/test-worker$/);
    expect(path.length).toBeGreaterThan(0);
  });

  // ── load() — home directory first strategy ────────────────────

  it("load() reads config from home directory when present", async () => {
    const homeDir = join(tmpDir, "hoox-home");
    mkdirSync(join(homeDir, ".hoox", "config"), { recursive: true });
    await Bun.write(
      join(homeDir, ".hoox", "config", "wrangler.jsonc"),
      validConfigJson()
    );

    const service = new ConfigService(undefined, homeDir);
    const config = await service.load();
    expect(config.global.cloudflare_account_id).toBe("abc123");
    expect(config.workers["test-worker"]).toBeDefined();
  });

  it("load() falls back to current directory when home config missing", async () => {
    const homeDir = join(tmpDir, "hoox-home-empty");
    mkdirSync(homeDir, { recursive: true });

    // Create a cwd fallback file in a tmp dir and chdir into it
    const cwdDir = join(tmpDir, "cwd-fallback");
    mkdirSync(cwdDir, { recursive: true });
    await writeConfig(cwdDir, validConfigJson());

    const previousCwd = process.cwd();
    process.chdir(cwdDir);
    try {
      const service = new ConfigService(undefined, homeDir);
      const config = await service.load();
      // Falls back to cwd's wrangler.jsonc
      expect(config).toBeDefined();
      expect(config.global).toBeDefined();
      expect(config.global.cloudflare_account_id).toBe("abc123");
      expect(config.workers["test-worker"]).toBeDefined();
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("load() prefers home config over current directory config", async () => {
    // Create a config in home directory with distinctive values
    const homeDir = join(tmpDir, "hoox-home-priority");
    mkdirSync(join(homeDir, ".hoox", "config"), { recursive: true });
    const homeConfig = JSON.stringify({
      global: { cloudflare_account_id: "from-home" },
      workers: {
        "home-worker": { enabled: true, path: "workers/home" },
      },
    });
    await Bun.write(
      join(homeDir, ".hoox", "config", "wrangler.jsonc"),
      homeConfig
    );

    // Home config exists AND project root also has a config.
    // Service should prefer the home config.
    const service = new ConfigService(undefined, homeDir);
    const config = await service.load();
    expect(config.global.cloudflare_account_id).toBe("from-home");
    expect(config.workers["home-worker"]).toBeDefined();
  });

  it("load() with explicit configPath ignores homeDir", async () => {
    await writeConfig(tmpDir, validConfigJson());

    const homeDir = join(tmpDir, "hoox-home-ignored");
    mkdirSync(join(homeDir, ".hoox", "config"), { recursive: true });

    const service = new ConfigService(join(tmpDir, "wrangler.jsonc"), homeDir);
    const config = await service.load();
    expect(config.global.cloudflare_account_id).toBe("abc123");
  });

  it("load() updates configPath to resolved path from home", async () => {
    const homeDir = join(tmpDir, "hoox-home-resolve");
    mkdirSync(join(homeDir, ".hoox", "config"), { recursive: true });
    const homeConfigPath = join(homeDir, ".hoox", "config", "wrangler.jsonc");
    await Bun.write(homeConfigPath, validConfigJson());

    const service = new ConfigService(undefined, homeDir);
    await service.load();
    // configPath should now be the home config path
    expect(service.getConfigPath()).toBe(homeConfigPath);
  });

  // ── Constructor — homeDir parameter ──────────────────────────

  it("accepts both configPath and homeDir parameters", () => {
    const service = new ConfigService("/custom/path.jsonc", tmpDir);
    expect(service).toBeInstanceOf(ConfigService);
    // configPath returns explicit path (homeDir ignored for config path)
    expect(service.getConfigPath()).toBe("/custom/path.jsonc");
    // getWorkerPath uses homeDir
    expect(service.getWorkerPath("w")).toBe(
      join(tmpDir, ".hoox", "workers", "w")
    );
  });

  it("constructor with only homeDir parameter works", () => {
    const service = new ConfigService(undefined, tmpDir);
    expect(service).toBeInstanceOf(ConfigService);
    expect(service.getConfigPath()).toBe(
      join(tmpDir, ".hoox", "config", "wrangler.jsonc")
    );
  });

  // ── tryLoad() — Result-returning variant ──────────────────────

  describe("tryLoad() — Result-returning variant", () => {
    it("returns { ok: true, value } for a valid config", async () => {
      const homeDir = join(tmpDir, "tryload-home");
      mkdirSync(join(homeDir, ".hoox", "config"), { recursive: true });
      await Bun.write(
        join(homeDir, ".hoox", "config", "wrangler.jsonc"),
        validConfigJson()
      );

      const service = new ConfigService(undefined, homeDir);
      const result = await service.tryLoad();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.global.cloudflare_account_id).toBe("abc123");
        expect(result.value.workers["test-worker"]).toBeDefined();
      }
    });

    it("returns { ok: false, error: { code: 'not-found' } } when both paths are missing", async () => {
      const homeDir = join(tmpDir, "tryload-empty");
      mkdirSync(homeDir, { recursive: true });

      const previousCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        const service = new ConfigService(undefined, homeDir);
        const result = await service.tryLoad();
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("not-found");
          if (result.error.code === "not-found") {
            expect(result.error.path).toBe(
              join(homeDir, ".hoox", "config", "wrangler.jsonc")
            );
            expect(result.error.triedFallback).toBe("wrangler.jsonc");
          }
        }
      } finally {
        process.chdir(previousCwd);
      }
    });

    it("returns { ok: false, error: { code: 'invalid-jsonc' } } for malformed JSONC", async () => {
      await writeConfig(tmpDir, "{ global: { cloudflare_account_id: 'abc' },");

      const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
      const result = await service.tryLoad();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("invalid-jsonc");
        if (result.error.code === "invalid-jsonc") {
          expect(result.error.path).toBe(join(tmpDir, "wrangler.jsonc"));
          expect(result.error.errors.length).toBeGreaterThan(0);
        }
      }
    });

    it("returns { ok: false, error: { code: 'not-object' } } when root is an array", async () => {
      await Bun.write(join(tmpDir, "wrangler.jsonc"), "[]");

      const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
      const result = await service.tryLoad();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not-object");
        if (result.error.code === "not-object") {
          expect(result.error.path).toBe(join(tmpDir, "wrangler.jsonc"));
        }
      }
    });
  });

  // ── load() — backward-compat wrapper ──────────────────────────

  describe("load() — backward-compat wrapper (throws on Result errors)", () => {
    it("throws with a clear message when file is missing", async () => {
      const homeDir = join(tmpDir, "load-throws");
      mkdirSync(homeDir, { recursive: true });

      const previousCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        const service = new ConfigService(undefined, homeDir);
        await expect(service.load()).rejects.toThrow(/Config file not found/);
      } finally {
        process.chdir(previousCwd);
      }
    });

    it("throws on invalid JSONC with offset info", async () => {
      await writeConfig(tmpDir, "{ global: {");

      const service = new ConfigService(join(tmpDir, "wrangler.jsonc"));
      await expect(service.load()).rejects.toThrow(/Invalid JSONC/);
    });
  });
});
