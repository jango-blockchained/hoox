/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the `hoox infra` command group.
 *
 * Tests each subcommand handler directly by injecting mock CloudflareService
 * and ConfigService instances. Output is captured via process.stdout.write mock.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  doD1List,
  doD1Create,
  doD1Delete,
  doKvList,
  doKvCreate,
  doKvDelete,
  doR2List,
  doR2Create,
  doR2Delete,
  doQueueList,
  doQueueCreate,
  doQueueDelete,
  doProvision,
  displayListResult,
  handleCreate,
  handleDelete,
  registerInfraCommand,
} from "./infra-command.js";
import type { InfraOptions } from "./types.js";
import type { WranglerResult } from "../../services/cloudflare/types.js";
import { Command } from "commander";

// ---------------------------------------------------------------------------
// Output capture helper
// ---------------------------------------------------------------------------

function captureStdout(): { output: () => string; restore: () => void } {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const writeMock = mock((chunk: string | Buffer) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  process.stdout.write = writeMock as unknown as typeof process.stdout.write;

  return {
    output: () => chunks.join(""),
    restore: () => {
      process.stdout.write = originalWrite;
    },
  };
}

// ---------------------------------------------------------------------------
// Mock CloudflareService builder
// ---------------------------------------------------------------------------

/** Successful wrangler result with data. */
function okResult<T>(value: T): WranglerResult<T> {
  return { ok: true, value } as WranglerResult<T>;
}

/** Failed wrangler result with error message. */
function errResult(error: string): WranglerResult<string> {
  return { ok: false, error };
}

/** Default JSON list output for D1. */
const D1_LIST_JSON = JSON.stringify([
  { name: "test-db", uuid: "abc-123", version: "production", num_tables: 3 },
  { name: "other-db", uuid: "def-456", version: "production", num_tables: 1 },
]);

/** Default JSON list output for KV. */
const KV_LIST_JSON = JSON.stringify([
  { id: "kv-abc", title: "config-kv", supports_url_encoding: true },
]);

/** Default JSON list output for R2. */
const R2_LIST_JSON = JSON.stringify([
  { name: "my-bucket", creation_date: "2024-01-15T00:00:00Z" },
]);

/** Default JSON list output for Queues. */
const QUEUE_LIST_JSON = JSON.stringify([
  { queue_name: "trade-queue", created_on: "2024-06-01T00:00:00Z" },
]);

interface MockCloudflareService {
  d1List: () => Promise<WranglerResult<string>>;
  d1Create: (name: string) => Promise<WranglerResult<string>>;
  d1Delete: (name: string) => Promise<WranglerResult<string>>;
  kvList: () => Promise<WranglerResult<string>>;
  kvCreate: (name: string) => Promise<WranglerResult<string>>;
  kvDelete: (id: string) => Promise<WranglerResult<string>>;
  r2List: () => Promise<WranglerResult<string>>;
  r2Create: (name: string) => Promise<WranglerResult<string>>;
  r2Delete: (name: string) => Promise<WranglerResult<string>>;
  queueList: () => Promise<WranglerResult<string>>;
  queueCreate: (name: string) => Promise<WranglerResult<string>>;
  queueDelete: (name: string) => Promise<WranglerResult<string>>;
}

function createMockCloudflare(
  overrides?: Partial<MockCloudflareService>
): MockCloudflareService {
  return {
    d1List: async () => okResult(D1_LIST_JSON),
    d1Create: async (name: string) => okResult(`Created ${name}`),
    d1Delete: async (name: string) => okResult(`Deleted ${name}`),
    kvList: async () => okResult(KV_LIST_JSON),
    kvCreate: async (name: string) => okResult(`Created ${name}`),
    kvDelete: async (id: string) => okResult(`Deleted ${id}`),
    r2List: async () => okResult(R2_LIST_JSON),
    r2Create: async (name: string) => okResult(`Created ${name}`),
    r2Delete: async (name: string) => okResult(`Deleted ${name}`),
    queueList: async () => okResult(QUEUE_LIST_JSON),
    queueCreate: async (name: string) => okResult(`Created ${name}`),
    queueDelete: async (name: string) => okResult(`Deleted ${name}`),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("infra-command", () => {
  let capture: ReturnType<typeof captureStdout>;
  const humanOpts: InfraOptions = { json: false, quiet: false };
  const jsonOpts: InfraOptions = { json: true, quiet: false };
  const quietOpts: InfraOptions = { json: false, quiet: true };

  beforeEach(() => {
    capture = captureStdout();
  });

  afterEach(() => {
    capture.restore();
    mock.restore();
  });

  // -- registerInfraCommand -------------------------------------------------

  describe("registerInfraCommand", () => {
    it("registers infra command with subcommands on a program", () => {
      const program = new Command();
      program.exitOverride();

      registerInfraCommand(program);

      // Verify the infra command exists
      const infraCmd = program.commands.find((c) => c.name() === "infra");
      expect(infraCmd).toBeDefined();

      // Verify subcommands exist
      const subNames = infraCmd!.commands.map((c) => c.name());
      expect(subNames).toContain("provision");
      expect(subNames).toContain("d1");
      expect(subNames).toContain("kv");
      expect(subNames).toContain("r2");
      expect(subNames).toContain("queues");

      // Verify d1 subcommands
      const d1Cmd = infraCmd!.commands.find((c) => c.name() === "d1");
      expect(d1Cmd).toBeDefined();
      const d1Subs = d1Cmd!.commands.map((c) => c.name());
      expect(d1Subs).toContain("list");
      expect(d1Subs).toContain("create");
      expect(d1Subs).toContain("delete");
    });
  });

  // -- displayListResult ----------------------------------------------------

  describe("displayListResult", () => {
    it("displays JSON array as a table in human mode", () => {
      const result = okResult(D1_LIST_JSON);
      displayListResult(result, humanOpts, ["name", "uuid"]);

      const out = capture.output();
      expect(out).toContain("test-db");
      expect(out).toContain("abc-123");
      expect(out).toContain("other-db");
      expect(out).toContain("def-456");
    });

    it("outputs raw JSON array in json mode", () => {
      const result = okResult(D1_LIST_JSON);
      displayListResult(result, jsonOpts, ["name", "uuid"]);

      const out = capture.output();
      const parsed = JSON.parse(out);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("test-db");
    });

    it("outputs nothing in quiet mode", () => {
      const result = okResult(D1_LIST_JSON);
      displayListResult(result, quietOpts, ["name"]);

      const out = capture.output();
      expect(out).toBe("");
    });

    it("falls back to raw text when output is not JSON", () => {
      const result = okResult("Raw text output from wrangler");
      displayListResult(result, humanOpts);

      const out = capture.output();
      expect(out).toContain("Raw text output from wrangler");
    });

    it("displays error when result is not ok", () => {
      const result = errResult("Authentication failed");
      displayListResult(result, humanOpts);

      const out = capture.output();
      expect(out).toContain("Authentication failed");
    });

    it("displays (empty) for empty array", () => {
      const result = okResult("[]");
      displayListResult(result, humanOpts);
      // Falls through to raw text since try/catch catches empty array
      // (our helper only attempts table for non-empty arrays)
      const out = capture.output();
      expect(out).toContain("[]");
    });
  });

  // -- handleCreate ---------------------------------------------------------

  describe("handleCreate", () => {
    it("shows success message on creation", async () => {
      await handleCreate(
        "my-resource",
        "D1 database",
        async () => okResult("created"),
        humanOpts
      );

      const out = capture.output();
      expect(out).toContain("Creating D1 database:");
      expect(out).toContain("my-resource");
    });

    it("shows error message on failure", async () => {
      await handleCreate(
        "bad-resource",
        "D1 database",
        async () => errResult("Already exists"),
        humanOpts
      );

      const out = capture.output();
      expect(out).toContain("Already exists");
    });
  });

  // -- handleDelete ---------------------------------------------------------

  describe("handleDelete", () => {
    it("shows success message on deletion", async () => {
      await handleDelete(
        "my-resource",
        "D1 database",
        async () => okResult("deleted"),
        humanOpts
      );

      const out = capture.output();
      expect(out).toContain("Deleting D1 database:");
      expect(out).toContain("my-resource");
    });

    it("shows error message on failure", async () => {
      await handleDelete(
        "missing",
        "D1 database",
        async () => errResult("Not found"),
        humanOpts
      );

      const out = capture.output();
      expect(out).toContain("Not found");
    });
  });

  // -- D1 handlers ----------------------------------------------------------

  describe("doD1List", () => {
    it("shows D1 databases as a table", async () => {
      const mockCf = createMockCloudflare();
      await doD1List(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("test-db");
      expect(out).toContain("other-db");
    });
  });

  describe("doD1Create", () => {
    it("creates a D1 database and shows success", async () => {
      const mockCf = createMockCloudflare();
      await doD1Create(
        "new-db",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("new-db");
    });
  });

  describe("doD1Delete", () => {
    it("deletes a D1 database and shows success", async () => {
      const mockCf = createMockCloudflare();
      await doD1Delete(
        "old-db",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("old-db");
    });
  });

  // -- KV handlers ----------------------------------------------------------

  describe("doKvList", () => {
    it("shows KV namespaces", async () => {
      const mockCf = createMockCloudflare();
      await doKvList(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("config-kv");
    });
  });

  describe("doKvCreate", () => {
    it("creates a KV namespace", async () => {
      const mockCf = createMockCloudflare();
      await doKvCreate(
        "my-kv",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("my-kv");
    });
  });

  describe("doKvDelete", () => {
    it("deletes a KV namespace by ID", async () => {
      const mockCf = createMockCloudflare();
      await doKvDelete(
        "kv-abc",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("kv-abc");
    });
  });

  // -- R2 handlers ----------------------------------------------------------

  describe("doR2List", () => {
    it("shows R2 buckets", async () => {
      const mockCf = createMockCloudflare();
      await doR2List(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("my-bucket");
    });
  });

  describe("doR2Create", () => {
    it("creates an R2 bucket", async () => {
      const mockCf = createMockCloudflare();
      await doR2Create(
        "new-bucket",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("new-bucket");
    });
  });

  describe("doR2Delete", () => {
    it("deletes an R2 bucket", async () => {
      const mockCf = createMockCloudflare();
      await doR2Delete(
        "old-bucket",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("old-bucket");
    });
  });

  // -- Queue handlers -------------------------------------------------------

  describe("doQueueList", () => {
    it("shows Queues", async () => {
      const mockCf = createMockCloudflare();
      await doQueueList(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("trade-queue");
    });
  });

  describe("doQueueCreate", () => {
    it("creates a Queue", async () => {
      const mockCf = createMockCloudflare();
      await doQueueCreate(
        "new-queue",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("new-queue");
    });
  });

  describe("doQueueDelete", () => {
    it("deletes a Queue", async () => {
      const mockCf = createMockCloudflare();
      await doQueueDelete(
        "old-queue",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("old-queue");
    });
  });

  // -- JSON output mode -----------------------------------------------------

  describe("JSON output mode", () => {
    it("outputs D1 list as JSON", async () => {
      const mockCf = createMockCloudflare();
      await doD1List(
        jsonOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      const parsed = JSON.parse(out);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("test-db");
    });

    it("outputs KV list as JSON", async () => {
      const mockCf = createMockCloudflare();
      await doKvList(
        jsonOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      const parsed = JSON.parse(out);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].id).toBe("kv-abc");
    });
  });

  // -- Quiet mode -----------------------------------------------------------

  describe("Quiet mode", () => {
    it("produces no output for list in quiet mode", async () => {
      const mockCf = createMockCloudflare();
      await doD1List(
        quietOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      expect(capture.output()).toBe("");
    });
  });

  // -- Error handling -------------------------------------------------------

  describe("error propagation", () => {
    it("shows error for failed D1 list", async () => {
      const mockCf = createMockCloudflare({
        d1List: async () => errResult("wrangler not authenticated"),
      });
      await doD1List(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("wrangler not authenticated");
    });

    it("shows error for failed D1 create", async () => {
      const mockCf = createMockCloudflare({
        d1Create: async () => errResult("database already exists"),
      });
      await doD1Create(
        "dup-db",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("database already exists");
    });

    it("shows error for failed queue delete", async () => {
      const mockCf = createMockCloudflare({
        queueDelete: async () => errResult("queue not found"),
      });
      await doQueueDelete(
        "ghost",
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService
      );

      const out = capture.output();
      expect(out).toContain("queue not found");
    });
  });

  // -- Provision ------------------------------------------------------------

  describe("doProvision", () => {
    // Save references to real implementations for restoration
    const realFile = Bun.file;

    afterEach(() => {
      (Bun as unknown as Record<string, unknown>).file = realFile;
    });

    it("returns empty result when no enabled workers", async () => {
      const mockConfig = {
        load: async () => ({ global: {}, workers: {} }),
        listEnabledWorkers: () => [] as string[],
        getWorker: () => undefined,
      };

      const mockCf = createMockCloudflare();
      const result = await doProvision(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService,
        mockConfig as unknown as import("../../services/config/config-service.js").ConfigService
      );

      expect(result.items).toEqual([]);
      expect(result.summary.total).toBe(0);
    });

    it("handles config load failure gracefully", async () => {
      const mockConfig = {
        load: async () => {
          throw new Error("Config file not found");
        },
        listEnabledWorkers: () => [] as string[],
        getWorker: () => undefined,
      };

      const mockCf = createMockCloudflare();
      const result = await doProvision(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService,
        mockConfig as unknown as import("../../services/config/config-service.js").ConfigService
      );

      expect(result.items).toEqual([]);
      expect(result.summary.total).toBe(0);

      const out = capture.output();
      expect(out).toContain("Config file not found");
    });

    it("provisions D1 databases from worker wrangler.jsonc", async () => {
      const workerPath = "/fake/workers/test-worker";

      const mockConfig = {
        load: async () => ({
          global: {},
          workers: { "test-worker": { enabled: true, path: workerPath } },
        }),
        listEnabledWorkers: () => ["test-worker"],
        getWorker: (name: string) =>
          name === "test-worker"
            ? { enabled: true, path: workerPath }
            : undefined,
      };

      const wranglerConfig = JSON.stringify({
        d1_databases: [
          { binding: "DB", database_name: "my-db", database_id: "xxx" },
        ],
      });

      // Mock Bun.file to return our fake wrangler.jsonc
      (Bun as unknown as Record<string, unknown>).file = mock((p: string) => ({
        exists: async () => p === `${workerPath}/wrangler.jsonc`,
        text: async () => wranglerConfig,
      }));

      const mockCf = createMockCloudflare({
        d1Create: async () => okResult("Created my-db"),
      });

      const result = await doProvision(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService,
        mockConfig as unknown as import("../../services/config/config-service.js").ConfigService
      );

      expect(result.items.length).toBeGreaterThan(0);
      const d1Item = result.items.find(
        (i) => i.name === "my-db" && i.type === "d1"
      );
      expect(d1Item).toBeDefined();
      expect(d1Item!.status).toBe("created");
    });

    it("marks resources as exists when wrangler reports already exists", async () => {
      const workerPath = "/fake/workers/existing-worker";

      const mockConfig = {
        load: async () => ({
          global: {},
          workers: { "existing-worker": { enabled: true, path: workerPath } },
        }),
        listEnabledWorkers: () => ["existing-worker"],
        getWorker: (name: string) =>
          name === "existing-worker"
            ? { enabled: true, path: workerPath }
            : undefined,
      };

      const wranglerConfig = JSON.stringify({
        r2_buckets: [{ binding: "FILES", bucket_name: "storage" }],
      });

      (Bun as unknown as Record<string, unknown>).file = mock((p: string) => ({
        exists: async () => p === `${workerPath}/wrangler.jsonc`,
        text: async () => wranglerConfig,
      }));

      const mockCf = createMockCloudflare({
        r2Create: async () => errResult("bucket already exists"),
      });

      const result = await doProvision(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService,
        mockConfig as unknown as import("../../services/config/config-service.js").ConfigService
      );

      const r2Item = result.items.find(
        (i) => i.name === "storage" && i.type === "r2"
      );
      expect(r2Item).toBeDefined();
      expect(r2Item!.status).toBe("exists");
    });

    it("handles workers without wrangler.jsonc gracefully", async () => {
      const workerPath = "/fake/workers/no-config-worker";

      const mockConfig = {
        load: async () => ({
          global: {},
          workers: { "no-config-worker": { enabled: true, path: workerPath } },
        }),
        listEnabledWorkers: () => ["no-config-worker"],
        getWorker: (name: string) =>
          name === "no-config-worker"
            ? { enabled: true, path: workerPath }
            : undefined,
      };

      (Bun as unknown as Record<string, unknown>).file = mock(() => ({
        exists: async () => false,
        text: async () => "",
      }));

      const mockCf = createMockCloudflare();
      const result = await doProvision(
        humanOpts,
        mockCf as unknown as import("../../services/cloudflare/cloudflare-service.js").CloudflareService,
        mockConfig as unknown as import("../../services/config/config-service.js").ConfigService
      );

      // No wrangler.jsonc → no items to provision
      expect(result.items).toEqual([]);
    });
  });
});
