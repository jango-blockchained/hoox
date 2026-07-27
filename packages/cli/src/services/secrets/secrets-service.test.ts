import { describe, it, expect, mock } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "./types.js";
import {
  SecretsService,
  isSystemSecret,
  SYSTEM_SECRET_NAMES,
} from "./secrets-service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Narrow a discriminated union Result<T> after checking ok.
 * Calling expect(result.ok).toBe(true) does not narrow the type,
 * so we use this to unwrap the value after asserting ok.
 */
function expectOk<T>(result: Result<T>): T {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
}

/**
 * Assert a Result<T> is an error and return the error message.
 */
function expectErr<T>(result: Result<T>): string {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: string }).error;
}

const WORKERS_JSONC = JSON.stringify({
  global: {},
  workers: {
    "telegram-worker": {
      enabled: true,
      path: "workers/telegram-worker",
      secrets: ["TG_BOT_TOKEN_BINDING"],
    },
    "trade-worker": {
      enabled: true,
      path: "workers/trade-worker",
      secrets: [
        "API_SERVICE_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
        "BINANCE_KEY_BINDING",
        "BINANCE_SECRET_BINDING",
      ],
    },
    "d1-worker": {
      enabled: true,
      path: "workers/d1-worker",
    },
    "no-secrets-worker": {
      enabled: true,
      path: "workers/no-secrets",
      secrets: [],
    },
  },
});

/**
 * Creates a SecretsService that reads from a synthetic wrangler.jsonc string
 * instead of hitting the real file-system.  We override `Bun.file` for the
 * config path only and call the private constructor via a test-only subclass.
 */
async function createService(workersJsonc?: string): Promise<SecretsService> {
  const jsonc = workersJsonc ?? WORKERS_JSONC;

  // Spy on Bun.file so we can intercept the config read while letting
  // real .dev.vars file-system calls through for the integration-style tests.
  const originalBunFile = Bun.file;

  // Use direct property assignment for Bun.file mock.
  // Object.defineProperty with configurable:true fails because Bun.file
  // is not configurable, but direct assignment (which requires only writable)
  // works in Bun 1.3.x for individual Bun properties.

  (Bun as any).file = mock((path: string) => {
    if (typeof path === "string" && path.endsWith("wrangler.jsonc")) {
      return {
        exists: mock(async () => true),
        text: mock(async () => jsonc),
      };
    }
    // Fall through to the real Bun.file for everything else
    return originalBunFile(path);
  });

  const svc = await SecretsService.create("wrangler.jsonc");

  // Restore original so subsequent tests aren't polluted

  (Bun as any).file = originalBunFile;

  return svc;
}

/** Returns a fresh temporary directory that is cleaned up after the test. */
function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hoox-secrets-test-"));
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SecretsService", () => {
  // -- listSecrets ----------------------------------------------------------

  describe("listSecrets", () => {
    it("returns correct secret names for a worker that has secrets", async () => {
      const svc = await createService();
      expect(svc.listSecrets("trade-worker")).toEqual([
        "API_SERVICE_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
        "BINANCE_KEY_BINDING",
        "BINANCE_SECRET_BINDING",
      ]);
    });

    it("returns single secret for telegram-worker", async () => {
      const svc = await createService();
      expect(svc.listSecrets("telegram-worker")).toEqual([
        "TG_BOT_TOKEN_BINDING",
      ]);
    });

    it("returns empty array for worker not in config", async () => {
      const svc = await createService();
      expect(svc.listSecrets("nonexistent")).toEqual([]);
    });

    it("returns empty array for worker with no secrets declared", async () => {
      const svc = await createService();
      expect(svc.listSecrets("d1-worker")).toEqual([]);
    });

    it("returns empty array for worker with explicitly empty secrets", async () => {
      const svc = await createService();
      expect(svc.listSecrets("no-secrets-worker")).toEqual([]);
    });
  });

  // -- listAllSecrets -------------------------------------------------------

  describe("listAllSecrets", () => {
    it("returns map of workers that have secrets", async () => {
      const svc = await createService();
      const all = svc.listAllSecrets();

      expect(Object.keys(all)).toHaveLength(2);
      expect(all["telegram-worker"]).toEqual(["TG_BOT_TOKEN_BINDING"]);
      expect(all["trade-worker"]).toEqual([
        "API_SERVICE_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
        "BINANCE_KEY_BINDING",
        "BINANCE_SECRET_BINDING",
      ]);
    });

    it("omits workers without secrets", async () => {
      const svc = await createService();
      const all = svc.listAllSecrets();
      expect(all["d1-worker"]).toBeUndefined();
      expect(all["no-secrets-worker"]).toBeUndefined();
    });
  });

  // -- checkLocalSecrets ----------------------------------------------------

  describe("checkLocalSecrets", () => {
    it("reports all secrets missing when .dev.vars does not exist", async () => {
      const svc = await createService();
      // Use a temp dir so no .dev.vars file exists
      const dir = tmpDir();
      try {
        // Override the worker path to point at the temp dir

        (svc as any).config.workers["trade-worker"].path = dir;

        const result = await svc.checkLocalSecrets("trade-worker");
        expect(result.worker).toBe("trade-worker");
        expect(result.allSet).toBe(false);
        expect(result.missing).toEqual([
          "API_SERVICE_KEY_BINDING",
          "INTERNAL_KEY_BINDING",
          "BINANCE_KEY_BINDING",
          "BINANCE_SECRET_BINDING",
        ]);
        expect(result.secrets).toHaveLength(4);
        for (const s of result.secrets) {
          expect(s.set).toBe(false);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("reports secrets as set when .dev.vars has real values", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          "API_SERVICE_KEY_BINDING=abc123\nINTERNAL_KEY_BINDING=int999\nBINANCE_KEY_BINDING=xyz789\nBINANCE_SECRET_BINDING=sec456\n"
        );

        const svc = await createService();

        (svc as any).config.workers["trade-worker"].path = dir;

        const result = await svc.checkLocalSecrets("trade-worker");
        expect(result.allSet).toBe(true);
        expect(result.missing).toEqual([]);
        for (const s of result.secrets) {
          expect(s.set).toBe(true);
          expect(s.source).toBe(join(dir, ".dev.vars"));
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("flags placeholder values as missing", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          "API_SERVICE_KEY_BINDING=placeholder_api_service_key\nINTERNAL_KEY_BINDING=real-internal\nBINANCE_KEY_BINDING=binance-real-key\nBINANCE_SECRET_BINDING=your_secret\n"
        );

        const svc = await createService();

        (svc as any).config.workers["trade-worker"].path = dir;

        const result = await svc.checkLocalSecrets("trade-worker");
        expect(result.allSet).toBe(false);
        // API_SERVICE placeholder + BINANCE_SECRET your_ — INTERNAL + BINANCE_KEY real
        expect(result.missing).toContain("API_SERVICE_KEY_BINDING");
        expect(result.missing).toContain("BINANCE_SECRET_BINDING");
        expect(result.missing).not.toContain("BINANCE_KEY_BINDING");
        expect(result.missing).not.toContain("INTERNAL_KEY_BINDING");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("handles comments and blank lines in .dev.vars", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          "# This is a comment\nAPI_SERVICE_KEY_BINDING=real-key\nINTERNAL_KEY_BINDING=int-key\n\n# Another comment\nBINANCE_KEY_BINDING=another-key\nBINANCE_SECRET_BINDING=third-key\n"
        );

        const svc = await createService();

        (svc as any).config.workers["trade-worker"].path = dir;

        const result = await svc.checkLocalSecrets("trade-worker");
        expect(result.allSet).toBe(true);
        expect(result.missing).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("returns empty result for unknown worker", async () => {
      const svc = await createService();
      const result = await svc.checkLocalSecrets("unknown-worker");
      expect(result.worker).toBe("unknown-worker");
      expect(result.secrets).toEqual([]);
      expect(result.allSet).toBe(false);
    });
  });

  // -- generateDevVars ------------------------------------------------------

  describe("generateDevVars", () => {
    it("creates .dev.vars with placeholder entries", async () => {
      const dir = tmpDir();
      try {
        const svc = await createService();

        (svc as any).config.workers["telegram-worker"].path = dir;

        const result = await svc.generateDevVars("telegram-worker");
        expect(expectOk(result)).toBe(join(dir, ".dev.vars"));

        // Verify file content
        const content = await Bun.file(join(dir, ".dev.vars")).text();
        expect(content).toContain(
          "TG_BOT_TOKEN_BINDING=placeholder_tg_bot_token_binding"
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("writes empty file for worker with no secrets", async () => {
      const dir = tmpDir();
      try {
        const svc = await createService();

        (svc as any).config.workers["no-secrets-worker"].path = dir;

        const result = await svc.generateDevVars("no-secrets-worker");
        expect(expectOk(result)).toBe(join(dir, ".dev.vars"));

        const content = await Bun.file(join(dir, ".dev.vars")).text();
        expect(content).toBe("");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("returns error for unknown worker", async () => {
      const svc = await createService();
      const result = await svc.generateDevVars("unknown-worker");
      expect(expectErr(result)).toContain("not found in config");
    });

    it("overwrites existing .dev.vars", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(join(dir, ".dev.vars"), "OLD_KEY=old_value\n");

        const svc = await createService();

        (svc as any).config.workers["telegram-worker"].path = dir;

        await svc.generateDevVars("telegram-worker");

        const content = await Bun.file(join(dir, ".dev.vars")).text();
        expect(content).toContain(
          "TG_BOT_TOKEN_BINDING=placeholder_tg_bot_token_binding"
        );
        expect(content).not.toContain("OLD_KEY");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // -- syncToCloudflare -----------------------------------------------------

  describe("syncToCloudflare", () => {
    it("pushes secrets via wrangler when valid values are in .dev.vars", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          "TG_BOT_TOKEN_BINDING=my-real-token\n"
        );

        const svc = await createService();

        (svc as any).config.workers["telegram-worker"].path = dir;

        // Stub execWranglerSecretPut to avoid real wrangler calls.
        const called: Array<[string, string]> = [];

        (svc as any).execWranglerSecretPut = mock(
          async (_path: string, name: string, value: string) => {
            called.push([name, value]);
          }
        );

        const result = await svc.syncToCloudflare("telegram-worker");
        const sync = expectOk(result);
        expect(sync.ok).toBe(true);
        expect(sync.synced).toEqual(["TG_BOT_TOKEN_BINDING"]);
        expect(called).toEqual([["TG_BOT_TOKEN_BINDING", "my-real-token"]]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("skips secrets that are placeholder values", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          "API_SERVICE_KEY_BINDING=placeholder_api_service_key\nINTERNAL_KEY_BINDING=real-internal\nBINANCE_KEY_BINDING=real-binance-key\nBINANCE_SECRET_BINDING=generate_something\n"
        );

        const svc = await createService();

        (svc as any).config.workers["trade-worker"].path = dir;

        const called: Array<[string, string]> = [];

        (svc as any).execWranglerSecretPut = mock(
          async (_path: string, name: string, value: string) => {
            called.push([name, value]);
          }
        );

        const result = await svc.syncToCloudflare("trade-worker");
        const sync = expectOk(result);
        // Real keys synced; placeholders skipped → ok=false
        expect(sync.ok).toBe(false);
        expect(sync.synced).toEqual([
          "INTERNAL_KEY_BINDING",
          "BINANCE_KEY_BINDING",
        ]);
        expect(sync.skipped.map((s) => s.name)).toContain(
          "API_SERVICE_KEY_BINDING"
        );
        expect(sync.skipped.map((s) => s.name)).toContain(
          "BINANCE_SECRET_BINDING"
        );
        expect(called).toEqual([
          ["INTERNAL_KEY_BINDING", "real-internal"],
          ["BINANCE_KEY_BINDING", "real-binance-key"],
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("with systemOnly only syncs mesh secrets and ignores exchange keys", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          [
            "API_SERVICE_KEY_BINDING=api-real",
            "INTERNAL_KEY_BINDING=int-real",
            "BINANCE_KEY_BINDING=placeholder_binance",
            "BINANCE_SECRET_BINDING=",
          ].join("\n") + "\n"
        );

        const svc = await createService();
        (svc as any).config.workers["trade-worker"].path = dir;

        const called: Array<[string, string]> = [];
        (svc as any).execWranglerSecretPut = mock(
          async (_path: string, name: string, value: string) => {
            called.push([name, value]);
          }
        );

        const result = await svc.syncToCloudflare("trade-worker", {
          systemOnly: true,
        });
        const sync = expectOk(result);
        expect(sync.ok).toBe(true);
        expect(sync.synced).toEqual([
          "API_SERVICE_KEY_BINDING",
          "INTERNAL_KEY_BINDING",
        ]);
        expect(called).toEqual([
          ["API_SERVICE_KEY_BINDING", "api-real"],
          ["INTERNAL_KEY_BINDING", "int-real"],
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("with systemOnly returns ok empty when worker has no system secrets", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          "TG_BOT_TOKEN_BINDING=my-real-token\n"
        );

        const svc = await createService();
        (svc as any).config.workers["telegram-worker"].path = dir;

        const called: Array<[string, string]> = [];
        (svc as any).execWranglerSecretPut = mock(
          async (_path: string, name: string, value: string) => {
            called.push([name, value]);
          }
        );

        const result = await svc.syncToCloudflare("telegram-worker", {
          systemOnly: true,
        });
        const sync = expectOk(result);
        expect(sync.ok).toBe(true);
        expect(sync.synced).toEqual([]);
        expect(called).toHaveLength(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("returns incomplete result when no .dev.vars exists", async () => {
      const dir = tmpDir();
      try {
        const svc = await createService();

        (svc as any).config.workers["trade-worker"].path = dir;

        const called: Array<[string, string]> = [];

        (svc as any).execWranglerSecretPut = mock(
          async (_path: string, name: string, value: string) => {
            called.push([name, value]);
          }
        );

        const result = await svc.syncToCloudflare("trade-worker");
        const sync = expectOk(result);
        expect(sync.ok).toBe(false);
        expect(sync.synced).toEqual([]);
        expect(sync.skipped.map((s) => s.name)).toContain(
          "API_SERVICE_KEY_BINDING"
        );
        expect(sync.skipped.map((s) => s.name)).toContain(
          "INTERNAL_KEY_BINDING"
        );
        expect(sync.skipped.map((s) => s.name)).toContain(
          "BINANCE_KEY_BINDING"
        );
        expect(called).toHaveLength(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("returns error for unknown worker", async () => {
      const svc = await createService();
      const result = await svc.syncToCloudflare("unknown-worker");
      expect(expectErr(result)).toContain("not found in config");
    });

    it("handles wrangler failures gracefully", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          "TG_BOT_TOKEN_BINDING=my-token\n"
        );

        const svc = await createService();

        (svc as any).config.workers["telegram-worker"].path = dir;

        // Stub execWranglerSecretPut to throw

        (svc as any).execWranglerSecretPut = mock(async () => {
          throw new Error("wrangler command failed");
        });

        const result = await svc.syncToCloudflare("telegram-worker");
        const sync = expectOk(result);
        expect(sync.ok).toBe(false);
        expect(sync.failed).toHaveLength(1);
        expect(sync.failed[0].name).toBe("TG_BOT_TOKEN_BINDING");
        expect(sync.failed[0].reason).toContain("wrangler command failed");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("works for worker with no secrets", async () => {
      const dir = tmpDir();
      try {
        const svc = await createService();

        (svc as any).config.workers["no-secrets-worker"].path = dir;

        const result = await svc.syncToCloudflare("no-secrets-worker");
        const sync = expectOk(result);
        expect(sync.ok).toBe(true);
        expect(sync.synced).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // -- isSystemSecret -------------------------------------------------------

  describe("isSystemSecret / SYSTEM_SECRET_NAMES", () => {
    it("classifies mesh keys as system", () => {
      expect(isSystemSecret("INTERNAL_KEY_BINDING")).toBe(true);
      expect(isSystemSecret("WEBHOOK_API_KEY_BINDING")).toBe(true);
      expect(isSystemSecret("AGENT_INTERNAL_KEY")).toBe(true);
      expect(isSystemSecret("SESSION_SECRET")).toBe(true);
      expect(SYSTEM_SECRET_NAMES).toContain("API_SERVICE_KEY_BINDING");
    });

    it("excludes integration secrets", () => {
      expect(isSystemSecret("BINANCE_KEY_BINDING")).toBe(false);
      expect(isSystemSecret("TG_BOT_TOKEN_BINDING")).toBe(false);
    });
  });

  // -- Edge cases -----------------------------------------------------------

  describe("edge cases", () => {
    it("throws when config file does not exist", async () => {
      await expect(
        SecretsService.create("/nonexistent/wrangler.jsonc")
      ).rejects.toThrow("Config file not found");
    });

    it("handles worker at path with trailing/leading whitespace in .dev.vars", async () => {
      const dir = tmpDir();
      try {
        writeFileSync(
          join(dir, ".dev.vars"),
          "   TG_BOT_TOKEN_BINDING   =   my-token   \n"
        );

        const svc = await createService();

        (svc as any).config.workers["telegram-worker"].path = dir;

        const result = await svc.checkLocalSecrets("telegram-worker");
        expect(result.allSet).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
