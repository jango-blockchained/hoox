import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KvSyncService } from "./kv-sync-service.js";

// ---------------------------------------------------------------------------
// Helpers — following cloudflare-service.test.ts patterns
// ---------------------------------------------------------------------------

const realSpawn = Bun.spawn;

type MockSpawnResult = {
  stdout: Blob;
  stderr: Blob;
  exited: Promise<number>;
  stdin?: {
    write: ReturnType<typeof mock>;
    end: ReturnType<typeof mock>;
  };
  kill: ReturnType<typeof mock>;
};

function makeSpawnResult(
  stdoutText: string,
  stderrText: string,
  exitCode: number
): MockSpawnResult {
  return {
    stdout: new Blob([stdoutText]),
    stderr: new Blob([stderrText]),
    exited: Promise.resolve(exitCode),
    stdin: {
      write: mock(() => {}),
      end: mock(() => {}),
    },
    kill: mock(() => {}),
  };
}

function successSpawn(stdout: string): MockSpawnResult {
  return makeSpawnResult(stdout, "", 0);
}

function errorSpawn(stderr: string, exitCode = 1): MockSpawnResult {
  return makeSpawnResult("", stderr, exitCode);
}

let lastSpawnCmd: string[] = [];

function mockSpawnWithCapture(result: MockSpawnResult): void {
  const _spawnMock = mock((cmd: string[], _options?: { cwd?: string }) => {
    lastSpawnCmd = cmd;
    return result;
  });
  (Bun as unknown as Record<string, unknown>).spawn = _spawnMock;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  lastSpawnCmd = [];
});

afterEach(() => {
  (Bun as unknown as Record<string, unknown>).spawn = realSpawn;
  mock.restore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("stripWranglerStdoutNoise", () => {
  it("removes version banners and keeps the payload", async () => {
    const { stripWranglerStdoutNoise } = await import("./kv-sync-service.js");
    const raw =
      "There is a newer version of Wrangler available (current: 4.98.0, latest: 4.112.0). Try upgrading.\n" +
      "false\n";
    expect(stripWranglerStdoutNoise(raw)).toBe("false");
  });
});

describe("KvSyncService", () => {
  // -- resolveNamespaceId ---------------------------------------------------

  describe("resolveNamespaceId", () => {
    it("returns the provided namespaceId directly", async () => {
      const service = new KvSyncService();
      const result = await service.resolveNamespaceId("abc-123");

      expect(result).toBe("abc-123");
    });

    it("looks up CONFIG_KV from wrangler namespace list", async () => {
      const namespaces = JSON.stringify([
        { id: "ns-1", title: "OTHER_KV" },
        { id: "ns-2", title: "CONFIG_KV" },
        { id: "ns-3", title: "ANOTHER_KV" },
      ]);
      mockSpawnWithCapture(successSpawn(namespaces));

      const service = new KvSyncService();
      const result = await service.resolveNamespaceId();

      expect(result).toBe("ns-2");
      expect(lastSpawnCmd).toEqual(["wrangler", "kv", "namespace", "list"]);
    });

    it("strips wrangler version banners before parsing JSON", async () => {
      const namespaces = JSON.stringify([
        { id: "ns-1", title: "OTHER_KV" },
        { id: "ns-cfg", title: "CONFIG_KV" },
      ]);
      const noisy =
        "There is a newer version of Wrangler available (current: 4.98.0, latest: 4.112.0). Try upgrading, as it might support this configuration option.\n" +
        namespaces;
      mockSpawnWithCapture(successSpawn(noisy));

      const service = new KvSyncService();
      const result = await service.resolveNamespaceId();

      expect(result).toBe("ns-cfg");
    });

    it("throws when CONFIG_KV not found in namespace list", async () => {
      const namespaces = JSON.stringify([{ id: "ns-1", title: "OTHER_KV" }]);
      mockSpawnWithCapture(successSpawn(namespaces));

      const service = new KvSyncService();

      await expect(service.resolveNamespaceId()).rejects.toThrow(
        "Could not resolve CONFIG_KV namespace ID"
      );
    });

    it("throws when wrangler exits non-zero", async () => {
      mockSpawnWithCapture(errorSpawn("Not authenticated"));

      const service = new KvSyncService();

      await expect(service.resolveNamespaceId()).rejects.toThrow(
        "Could not resolve CONFIG_KV namespace ID"
      );
    });

    it("throws when wrangler output is not valid JSON", async () => {
      mockSpawnWithCapture(successSpawn("not json at all"));

      const service = new KvSyncService();

      await expect(service.resolveNamespaceId()).rejects.toThrow(
        "Could not resolve CONFIG_KV namespace ID"
      );
    });

    it("throws when Bun.spawn itself throws", async () => {
      const spawnMock = mock(() => {
        throw new Error("wrangler not found");
      });
      (Bun as unknown as Record<string, unknown>).spawn = spawnMock;

      const service = new KvSyncService();

      await expect(service.resolveNamespaceId()).rejects.toThrow(
        "Could not resolve CONFIG_KV namespace ID"
      );
    });
  });

  // -- list -----------------------------------------------------------------

  describe("list", () => {
    it("returns parsed JSON array on success", async () => {
      const keys = JSON.stringify([
        { name: "key-one" },
        { name: "key-two" },
        { name: "key-three" },
      ]);
      mockSpawnWithCapture(successSpawn(keys));

      const service = new KvSyncService();
      const result = await service.list("ns-123");

      expect(result).toEqual([
        { name: "key-one" },
        { name: "key-two" },
        { name: "key-three" },
      ]);
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "kv",
        "key",
        "list",
        "--namespace-id",
        "ns-123",
      ]);
    });

    it("parses non-JSON output line by line", async () => {
      mockSpawnWithCapture(successSpawn("key-one\nkey-two\nkey-three\n"));

      const service = new KvSyncService();
      const result = await service.list("ns-123");

      expect(result).toEqual([
        { name: "key-one" },
        { name: "key-two" },
        { name: "key-three" },
      ]);
    });

    it("throws when wrangler exits non-zero", async () => {
      mockSpawnWithCapture(errorSpawn("Namespace not found"));

      const service = new KvSyncService();

      await expect(service.list("bad-ns")).rejects.toThrow(
        "Failed to list KV keys"
      );
    });
  });

  // -- get ------------------------------------------------------------------

  describe("get", () => {
    it("returns the key value on success", async () => {
      mockSpawnWithCapture(successSpawn("my-value"));

      const service = new KvSyncService();
      const result = await service.get("ns-123", "my-key");

      expect(result).toBe("my-value");
      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "kv",
        "key",
        "get",
        "--namespace-id",
        "ns-123",
        "my-key",
      ]);
    });

    it("strips wrangler version banners from the key value", async () => {
      mockSpawnWithCapture(
        successSpawn(
          "There is a newer version of Wrangler available (current: 4.98.0, latest: 4.112.0). Try upgrading, as it might support this configuration option.\nfalse\n"
        )
      );

      const service = new KvSyncService();
      const result = await service.get("ns-123", "trade:kill_switch");

      expect(result).toBe("false");
    });

    it("returns null when key is not found", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "not found", 1));

      const service = new KvSyncService();
      const result = await service.get("ns-123", "missing-key");

      expect(result).toBeNull();
    });

    it("throws on non-zero exit for errors other than not-found", async () => {
      mockSpawnWithCapture(errorSpawn("Internal server error"));

      const service = new KvSyncService();

      await expect(service.get("ns-123", "my-key")).rejects.toThrow(
        'Failed to get key "my-key"'
      );
    });

    it("returns null when stdout is empty", async () => {
      mockSpawnWithCapture(successSpawn(""));

      const service = new KvSyncService();
      const result = await service.get("ns-123", "empty-key");

      expect(result).toBeNull();
    });

    it("throws with fallback message when stderr is empty but exit non-zero", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 1));

      const service = new KvSyncService();

      await expect(service.get("ns-123", "my-key")).rejects.toThrow(
        'Failed to get key "my-key"'
      );
    });
  });

  // -- set ------------------------------------------------------------------

  describe("set", () => {
    it("resolves on successful key set", async () => {
      const result = successSpawn("");
      mockSpawnWithCapture(result);

      const service = new KvSyncService();

      await service.set("ns-123", "my-key", "my-value");

      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "kv",
        "key",
        "put",
        "--namespace-id",
        "ns-123",
        "my-key",
      ]);
      // Value must be piped through stdin, not exposed in argv
      expect(result.stdin?.write).toHaveBeenCalledWith("my-value\n");
      expect(result.stdin?.end).toHaveBeenCalled();
    });

    it("throws on non-zero exit", async () => {
      mockSpawnWithCapture(errorSpawn("Namespace not found"));

      const service = new KvSyncService();

      await expect(service.set("ns-123", "my-key", "my-value")).rejects.toThrow(
        'Failed to set key "my-key"'
      );
    });

    it("throws with fallback message when stderr is empty", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 1));

      const service = new KvSyncService();

      await expect(service.set("ns-123", "my-key", "my-value")).rejects.toThrow(
        'Failed to set key "my-key"'
      );
    });
  });

  // -- delete ---------------------------------------------------------------

  describe("delete", () => {
    it("resolves on successful key delete", async () => {
      mockSpawnWithCapture(successSpawn(""));

      const service = new KvSyncService();

      await service.delete("ns-123", "old-key");

      expect(lastSpawnCmd).toEqual([
        "wrangler",
        "kv",
        "key",
        "delete",
        "--namespace-id",
        "ns-123",
        "old-key",
      ]);
    });

    it("throws on non-zero exit", async () => {
      mockSpawnWithCapture(errorSpawn("Key not found"));

      const service = new KvSyncService();

      await expect(service.delete("ns-123", "missing-key")).rejects.toThrow(
        'Failed to delete key "missing-key"'
      );
    });

    it("throws with fallback message when stderr is empty", async () => {
      mockSpawnWithCapture(makeSpawnResult("", "", 1));

      const service = new KvSyncService();

      await expect(service.delete("ns-123", "bad-key")).rejects.toThrow(
        'Failed to delete key "bad-key"'
      );
    });
  });

  // -- getManifest ----------------------------------------------------------

  describe("getManifest", () => {
    /** packages/cli/src/services/kv → monorepo root */
    const monorepoRoot = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../../../../.."
    );

    it("returns the KV manifest with namespace and keys from dashboard.jsonc", () => {
      const manifest = KvSyncService.getManifest(monorepoRoot);

      expect(manifest.namespace).toBe("CONFIG_KV");
      expect(Array.isArray(manifest.keys)).toBe(true);
      expect(manifest.keys.length).toBeGreaterThan(20);
    });

    it("includes keys from dashboard.jsonc manifests", () => {
      const manifest = KvSyncService.getManifest(monorepoRoot);
      const keyNames = manifest.keys.map((k) => k.key);

      expect(keyNames).toContain("webhook:tradingview:ip_check_enabled");
      expect(keyNames).toContain("trade:kill_switch");
      expect(keyNames).toContain("agent:openai_key");
      expect(keyNames).toContain("global:kill_switch");
      expect(keyNames).toContain("routing:default_exchange");
      expect(keyNames).toContain("email:coin_pattern");
      expect(keyNames).toContain("exchange:mexc:enabled");
    });

    it("marks secret keys with secret=true", () => {
      const manifest = KvSyncService.getManifest(monorepoRoot);
      const secrets = manifest.keys.filter((k) => k.secret);

      expect(secrets.length).toBeGreaterThan(0);
      for (const secret of secrets) {
        expect(secret.secret).toBe(true);
      }
      expect(secrets.some((s) => s.key === "agent:openai_key")).toBe(true);
    });

    it("provides type and default for every key", () => {
      const manifest = KvSyncService.getManifest(monorepoRoot);

      for (const key of manifest.keys) {
        expect(key.type).toMatch(/^(boolean|number|string)$/);
        expect(typeof key.default).toBe("string");
        expect(typeof key.description).toBe("string");
      }
    });

    it("returns empty keys when monorepo root is missing", () => {
      const manifest = KvSyncService.getManifest("/tmp/no-such-hoox-root");
      expect(manifest.keys).toEqual([]);
    });
  });

  // -- getManifestKeys ------------------------------------------------------

  describe("getManifestKeys", () => {
    it("returns the manifest keys array", () => {
      const keys = KvSyncService.getManifestKeys();

      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBe(KvSyncService.getManifest().keys.length);
    });
  });
});
