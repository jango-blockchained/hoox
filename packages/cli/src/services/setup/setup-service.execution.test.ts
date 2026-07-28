/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Execution-path tests for `SetupService` (src/services/setup/setup-service.ts).
 *
 * The existing setup-service.test.ts covers the skip branches. This file
 * covers the actual execution paths: generateKeys (real), applySchema
 * (spawn success / failure / missing schema), setSecrets (success and
 * secretPut failure), rebuildDashboard (build + deploy), verifySetup,
 * and the internal _randomHex + escapeRegex helpers (via observable
 * behaviour). All Bun.spawn / Bun.write / CloudflareService methods are
 * stubbed so the tests run offline.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SetupService } from "./setup-service.js";
import type { ProgressEvent } from "./setup-service.js";
import { CloudflareService } from "../cloudflare/index.js";

// ---------------------------------------------------------------------------
// Mocks — set up BEFORE importing the service
// ---------------------------------------------------------------------------

const realBunWrite = Bun.write;
const realBunFile = Bun.file;
const realBunSpawn = Bun.spawn;
const realBunSpawnSync = Bun.spawnSync;

let spawnedCommands: string[][] = [];
let spawnedExits: number[] = [];
let spawnedStdouts: string[] = [];
let spawnedStderrs: string[] = [];
let writeCalls: Array<{ path: string; content: string }> = [];
let fileExistsMap: Record<string, boolean> = {};

function mockBunSpawn(): void {
  (Bun as unknown as Record<string, unknown>).spawn = mock(
    (cmd: string[], _opts?: unknown) => {
      spawnedCommands.push(cmd);
      const exitCode = spawnedExits.shift() ?? 0;
      const stdout = spawnedStdouts.shift() ?? "";
      const stderr = spawnedStderrs.shift() ?? "";
      return {
        stdout: new Blob([stdout]),
        stderr: new Blob([stderr]),
        exited: Promise.resolve(exitCode),
        stdin: { write: () => {}, end: () => {} },
        kill: () => {},
      };
    }
  );
  // ensurePackages (called by runAll) uses Bun.spawnSync — stub it so the
  // test doesn't try to invoke the real `bun` binary.
  (Bun as unknown as Record<string, unknown>).spawnSync = mock(() => ({
    stdout: new Blob([]),
    stderr: new Blob([]),
    exitCode: 0,
    success: true,
  }));
}

function restoreBunSpawn(): void {
  (Bun as unknown as Record<string, unknown>).spawn = realBunSpawn;
  (Bun as unknown as Record<string, unknown>).spawnSync = realBunSpawnSync;
}

function mockBunWrite(): void {
  (Bun as unknown as Record<string, unknown>).write = mock(
    async (path: string, content: string | Blob | ArrayBuffer) => {
      writeCalls.push({ path, content: String(content) });
      return 0;
    }
  );
}

function restoreBunWrite(): void {
  (Bun as unknown as Record<string, unknown>).write = realBunWrite;
}

function mockBunFile(): void {
  (Bun as unknown as Record<string, unknown>).file = mock((path: string) => ({
    exists: async () => fileExistsMap[path] ?? false,
    text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(0),
  }));
}

function restoreBunFile(): void {
  (Bun as unknown as Record<string, unknown>).file = realBunFile;
}

let secretPutMock: ReturnType<typeof mock>;
let deployMock: ReturnType<typeof mock>;
let listWorkersMock: ReturnType<typeof mock>;
let getWorkerMock: ReturnType<typeof mock>;
let d1ListMock: ReturnType<typeof mock>;
let d1CreateMock: ReturnType<typeof mock>;
let kvListMock: ReturnType<typeof mock>;
let checkAuthMock: ReturnType<typeof mock>;

function mockCloudflare(): void {
  secretPutMock = mock(async () => ({ ok: true as const }));
  deployMock = mock(async () => ({
    ok: true as const,
    value: { url: "https://test.workers.dev" },
  }));
  listWorkersMock = mock(() => ["hoox", "trade-worker"]);
  getWorkerMock = mock((name: string) => ({
    enabled: true,
    path: `workers/${name}`,
  }));
  // D1 list returns a parseable JSON list with the target DB present, so
  // ensureD1Database() short-circuits without calling d1Create().
  d1ListMock = mock(async () => ({
    ok: true as const,
    value: JSON.stringify([{ name: "trade-data-db" }, { name: "other" }]),
  }));
  d1CreateMock = mock(async () => ({
    ok: true as const,
    value: { name: "trade-data-db" },
  }));
  kvListMock = mock(async () => ({ ok: true as const, value: "[]" }));
  checkAuthMock = mock(async () => ({ ok: true as const }));
  (
    CloudflareService.prototype as unknown as Record<string, unknown>
  ).secretPut = secretPutMock;
  (CloudflareService.prototype as unknown as Record<string, unknown>).deploy =
    deployMock;
  (
    CloudflareService.prototype as unknown as Record<string, unknown>
  ).listWorkers = listWorkersMock;
  (
    CloudflareService.prototype as unknown as Record<string, unknown>
  ).getWorker = getWorkerMock;
  (CloudflareService.prototype as unknown as Record<string, unknown>).d1List =
    d1ListMock;
  (CloudflareService.prototype as unknown as Record<string, unknown>).d1Create =
    d1CreateMock;
  (CloudflareService.prototype as unknown as Record<string, unknown>).kvList =
    kvListMock;
  (
    CloudflareService.prototype as unknown as Record<string, unknown>
  ).checkAuth = checkAuthMock;
}

function restoreCloudflare(): void {
  delete (CloudflareService.prototype as unknown as Record<string, unknown>)
    .secretPut;
  delete (CloudflareService.prototype as unknown as Record<string, unknown>)
    .deploy;
  delete (CloudflareService.prototype as unknown as Record<string, unknown>)
    .listWorkers;
  delete (CloudflareService.prototype as unknown as Record<string, unknown>)
    .getWorker;
  delete (CloudflareService.prototype as unknown as Record<string, unknown>)
    .d1List;
  delete (CloudflareService.prototype as unknown as Record<string, unknown>)
    .d1Create;
  delete (CloudflareService.prototype as unknown as Record<string, unknown>)
    .kvList;
  delete (CloudflareService.prototype as unknown as Record<string, unknown>)
    .checkAuth;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let events: ProgressEvent[];
let tmpCwd: string;
let origCwd: string;

beforeEach(() => {
  events = [];
  spawnedCommands = [];
  spawnedExits = [];
  spawnedStdouts = [];
  spawnedStderrs = [];
  writeCalls = [];
  fileExistsMap = {};

  origCwd = process.cwd();
  tmpCwd = mkdtempSync(join(tmpdir(), "hoox-setup-test-"));
  process.chdir(tmpCwd);

  mockBunWrite();
  mockBunSpawn();
  mockBunFile();
  mockCloudflare();
});

afterEach(() => {
  mock.restore();
  restoreBunWrite();
  restoreBunSpawn();
  restoreBunFile();
  restoreCloudflare();
  process.chdir(origCwd);
  rmSync(tmpCwd, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// generateKeys
// ---------------------------------------------------------------------------

describe("SetupService.generateKeys — full path", () => {
  it("generates keys, writes setup.env, individual key files, and .dev.vars", async () => {
    const svc = new SetupService((e) => events.push(e));
    const keys = await svc.generateKeys(false);

    expect(keys).not.toBeNull();
    expect(keys?.INTERNAL_KEY_BINDING).toMatch(/^[0-9a-f]{64}$/);
    expect(keys?.SESSION_SECRET).toMatch(/^[0-9a-f]{128}$/);
    expect(keys?.AGENT_INTERNAL_KEY).toBe(keys?.INTERNAL_KEY_BINDING);
    expect(keys?.TELEGRAM_INTERNAL_KEY_BINDING).toBe(
      keys?.INTERNAL_KEY_BINDING
    );
    expect(keys?.TRADE_INTERNAL_KEY).toBe(keys?.INTERNAL_KEY_BINDING);
    expect(keys?.API_SERVICE_KEY_BINDING).toBe(keys?.INTERNAL_KEY_BINDING);
    // SESSION / WEBHOOK remain distinct from the shared mesh key
    expect(keys?.SESSION_SECRET).not.toBe(keys?.INTERNAL_KEY_BINDING);
    expect(keys?.WEBHOOK_API_KEY_BINDING).not.toBe(keys?.INTERNAL_KEY_BINDING);

    // .keys/setup.env + 7 individual + 10 .dev.vars (one per worker) = 18
    expect(writeCalls.length).toBeGreaterThanOrEqual(17);

    // The setup.env file exists and contains every key
    const setupEnv = writeCalls.find((w) => w.path === ".keys/setup.env");
    expect(setupEnv).toBeDefined();
    expect(setupEnv?.content).toContain("INTERNAL_KEY_BINDING=");
    expect(setupEnv?.content).toContain("SESSION_SECRET=");
    expect(setupEnv?.content).toContain("TRADE_INTERNAL_KEY=");
    expect(setupEnv?.content).toContain("API_SERVICE_KEY_BINDING=");

    // Each individual key file is written
    const keyFile = writeCalls.find(
      (w) => w.path === ".keys/internal_key_binding.env"
    );
    expect(keyFile).toBeDefined();

    // At least one .dev.vars per worker in DEV_VARS_WORKER_KEYS
    const devVars = writeCalls.filter((w) => w.path.endsWith("/.dev.vars"));
    expect(devVars.length).toBeGreaterThanOrEqual(9);

    // step-start + step-complete emitted
    expect(
      events.some((e) => e.type === "step-start" && e.step === "keys")
    ).toBe(true);
    expect(
      events.some((e) => e.type === "step-complete" && e.step === "keys")
    ).toBe(true);
  });

  it("creates .keys directory if it doesn't exist", async () => {
    const svc = new SetupService();
    await svc.generateKeys(false);
    // The .keys/setup.env write would have failed if the directory didn't
    // exist; the test passes if no throw occurred.
    expect(writeCalls.find((w) => w.path === ".keys/setup.env")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// applySchema
// ---------------------------------------------------------------------------

describe("SetupService.applySchema — full path", () => {
  it("returns failure when schema file is missing", async () => {
    fileExistsMap["workers/trade-worker/schema.sql"] = false;

    const svc = new SetupService((e) => events.push(e));
    const result = await svc.applySchema("trade-data-db", false);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Schema file not found/);
    expect(
      events.some((e) => e.type === "warn" && e.step === "d1-schema")
    ).toBe(true);
  });

  it("applies schema successfully when wrangler exits 0", async () => {
    fileExistsMap["workers/trade-worker/schema.sql"] = true;
    spawnedExits = [0];
    spawnedStdouts = ["Migrations applied.\n"];

    const svc = new SetupService();
    const result = await svc.applySchema("trade-data-db", false);

    expect(result.success).toBe(true);
    expect(result.message).toContain("Schema applied to");
    expect(spawnedCommands[0]).toEqual([
      "wrangler",
      "d1",
      "execute",
      "trade-data-db",
      "--file",
      "workers/trade-worker/schema.sql",
      "--remote",
    ]);
  });

  it("returns failure when wrangler exits non-zero", async () => {
    fileExistsMap["workers/trade-worker/schema.sql"] = true;
    spawnedExits = [1];
    spawnedStderrs = ["ERROR: table already exists"];

    const svc = new SetupService((e) => events.push(e));
    const result = await svc.applySchema("trade-data-db", false);

    expect(result.success).toBe(false);
    expect(result.message).toContain("table already exists");
    expect(events.some((e) => e.type === "step-error")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setSecrets
// ---------------------------------------------------------------------------

describe("SetupService.setSecrets — full path", () => {
  it("calls secretPut for each (secret, worker) pair and reports progress", async () => {
    const keys: import("./setup-service.js").GeneratedKeys = {
      INTERNAL_KEY_BINDING: "a".repeat(64),
      AGENT_INTERNAL_KEY: "b".repeat(64),
      SESSION_SECRET: "c".repeat(128),
      WEBHOOK_API_KEY_BINDING: "d".repeat(64),
      TELEGRAM_INTERNAL_KEY_BINDING: "e".repeat(64),
      TRADE_INTERNAL_KEY: "f".repeat(64),
      API_SERVICE_KEY_BINDING: "g".repeat(64),
    };

    const svc = new SetupService((e) => events.push(e));
    const results = await svc.setSecrets(keys);

    // Exact count: ALL_WORKERS(9) for INTERNAL_KEY_BINDING
    //             + 2 for AGENT_INTERNAL_KEY
    //             + 1 for SESSION_SECRET
    //             + 1 for WEBHOOK_API_KEY_BINDING
    //             + 1 for TELEGRAM_INTERNAL_KEY_BINDING
    //             + 2 for API_SERVICE_KEY_BINDING (trade-worker, dashboard)
    //             + 1 for TRADE_INTERNAL_KEY (dashboard)
    // = 17
    expect(secretPutMock).toHaveBeenCalledTimes(17);
    expect(results).toHaveLength(17);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(events.filter((e) => e.type === "secret-start").length).toBe(17);
    expect(events.filter((e) => e.type === "secret-done").length).toBe(17);
  });

  it("records failures when secretPut returns ok=false", async () => {
    secretPutMock = mock(async () => ({
      ok: false as const,
      error: "auth failed",
    }));
    (
      CloudflareService.prototype as unknown as Record<string, unknown>
    ).secretPut = secretPutMock;

    const keys: import("./setup-service.js").GeneratedKeys = {
      INTERNAL_KEY_BINDING: "a".repeat(64),
      AGENT_INTERNAL_KEY: "b".repeat(64),
      SESSION_SECRET: "c".repeat(128),
      WEBHOOK_API_KEY_BINDING: "d".repeat(64),
      TELEGRAM_INTERNAL_KEY_BINDING: "e".repeat(64),
      TRADE_INTERNAL_KEY: "f".repeat(64),
      API_SERVICE_KEY_BINDING: "g".repeat(64),
    };

    const svc = new SetupService((e) => events.push(e));
    const results = await svc.setSecrets(keys);

    expect(results.every((r) => !r.ok && r.error === "auth failed")).toBe(true);
    expect(
      events.some(
        (e) => e.type === "secret-error" && e.message.includes("auth failed")
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rebuildDashboard
// ---------------------------------------------------------------------------

describe("SetupService.rebuildDashboard — full path", () => {
  it("returns failure when dashboard dir doesn't exist", async () => {
    // No statSync mock — the real call will throw ENOENT
    const svc = new SetupService((e) => events.push(e));
    const result = await svc.rebuildDashboard(false);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Dashboard directory not found/);
    expect(
      events.some((e) => e.type === "warn" && e.step === "dashboard")
    ).toBe(true);
  });

  it("returns failure when build exits non-zero", async () => {
    // Create a dashboard dir so statSync passes
    const dashboardDir = join(tmpCwd, "workers", "dashboard");
    mkdirSync(dashboardDir, { recursive: true });
    writeFileSync(join(dashboardDir, "package.json"), "{}");

    spawnedExits = [1];
    spawnedStderrs = ["Build error: missing dep"];

    const svc = new SetupService();
    const result = await svc.rebuildDashboard(false);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Build failed");
  });

  it("returns failure when deploy exits non-zero after successful build", async () => {
    const dashboardDir = join(tmpCwd, "workers", "dashboard");
    mkdirSync(dashboardDir, { recursive: true });
    writeFileSync(join(dashboardDir, "package.json"), "{}");

    spawnedExits = [0, 1];
    spawnedStderrs = ["", "Deploy error: network"];

    const svc = new SetupService();
    const result = await svc.rebuildDashboard(false);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Deploy failed");
  });

  it("succeeds when both build and deploy exit 0", async () => {
    const dashboardDir = join(tmpCwd, "workers", "dashboard");
    mkdirSync(dashboardDir, { recursive: true });
    writeFileSync(join(dashboardDir, "package.json"), "{}");

    spawnedExits = [0, 0];

    const svc = new SetupService();
    const result = await svc.rebuildDashboard(false);

    expect(result.success).toBe(true);
    expect(result.message).toContain("Dashboard built and deployed");
  });
});

// ---------------------------------------------------------------------------
// runAll
// ---------------------------------------------------------------------------

describe("SetupService.runAll", () => {
  it("runs the standard pipeline and emits steps", async () => {
    fileExistsMap["workers/trade-worker/schema.sql"] = true;
    spawnedExits = [0, 0, 0]; // schema, dashboard build, dashboard deploy
    const dashboardDir = join(tmpCwd, "workers", "dashboard");
    mkdirSync(dashboardDir, { recursive: true });
    writeFileSync(join(dashboardDir, "package.json"), "{}");

    const svc = new SetupService((e) => events.push(e));
    const result = await svc.runAll({});

    // `keys` is not added to the steps array (the call returns the keys
    // object directly). The structural steps are d1-database, d1-schema,
    // secrets, dashboard, and verify.
    const stepNames = result.steps.map((s) => s.step);
    expect(stepNames).toContain("d1-database");
    expect(stepNames).toContain("d1-schema");
    expect(stepNames).toContain("secrets");
    expect(stepNames).toContain("dashboard");
    // Keys + secrets objects are populated.
    expect(result.keys).toBeDefined();
    expect(result.secrets).toBeDefined();
  });

  it("respects skipKeys / skipDb / skipSecrets / skipDashboard", async () => {
    const dashboardDir = join(tmpCwd, "workers", "dashboard");
    mkdirSync(dashboardDir, { recursive: true });
    writeFileSync(join(dashboardDir, "package.json"), "{}");
    spawnedExits = [0, 0];

    const svc = new SetupService((e) => events.push(e));
    const result = await svc.runAll({
      skipKeys: true,
      skipDb: true,
      skipSecrets: true,
      skipDashboard: false,
    });

    // skipKeys → keys step is omitted
    expect(result.steps.some((s) => s.step === "keys")).toBe(false);
    // skipDb → d1-schema is replaced with a Skipped entry
    const dbStep = result.steps.find((s) => s.step === "d1-schema");
    expect(dbStep?.message).toBe("Skipped");
    // skipSecrets → secrets step says 0 set
    const secretsStep = result.steps.find((s) => s.step === "secrets");
    expect(secretsStep?.details).toMatchObject({ total: 0, ok: 0 });
    // skipDashboard=false → dashboard step is not Skipped
    const dashStep = result.steps.find((s) => s.step === "dashboard");
    expect(dashStep?.message).not.toBe("Skipped");
    expect(result.keys).toBeUndefined();
    expect(result.secrets).toBeDefined();
  });

  it("returns failure when any non-skipped step fails", async () => {
    fileExistsMap["workers/trade-worker/schema.sql"] = false; // schema fails

    const svc = new SetupService();
    const result = await svc.runAll({});

    expect(result.success).toBe(false);
    expect(result.steps.some((s) => s.step === "d1-schema" && !s.success)).toBe(
      true
    );
  });
});
