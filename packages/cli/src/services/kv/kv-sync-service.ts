import {
  loadDashboardKvManifestFromRoot,
  resolveHooxRuntimeRoot,
  type DashboardKvManifestKey,
} from "@jango-blockchained/hoox-shared";
import { extractJsonArray } from "../cloudflare/cloudflare-service.js";

export type KvManifestKey = DashboardKvManifestKey;

export interface KvManifest {
  namespace: string;
  keys: KvManifestKey[];
}

/**
 * Resolve monorepo root for dashboard.jsonc discovery.
 * Prefer runtime root (HOOX_REPO / cwd / ~/.hoox/repo). Runtime resolution
 * already walks from cwd, so a second findHooxSetupRoot pass is unnecessary.
 */
function resolveManifestRoot(): string | null {
  return resolveHooxRuntimeRoot().root;
}

/**
 * Strip wrangler version banners / box-drawing noise that often lands on
 * stdout before the real payload (JSON arrays or KV values).
 */
export function stripWranglerStdoutNoise(raw: string): string {
  const lines = raw.split("\n");
  const cleaned = lines.filter((line) => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith("There is a newer version of Wrangler")) return false;
    if (t.includes("update available")) return false;
    if (t.startsWith("⛅")) return false;
    // Horizontal rule / separator lines from wrangler chrome
    if (/^[─\-═]{3,}$/.test(t)) return false;
    if (t.startsWith("▲ [WARNING]") || t.startsWith("✘ [ERROR]")) return false;
    return true;
  });
  return cleaned.join("\n").trim();
}

export class KvSyncService {
  async resolveNamespaceId(namespaceId?: string): Promise<string> {
    if (namespaceId) return namespaceId;

    try {
      const proc = Bun.spawn(["wrangler", "kv", "namespace", "list"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode === 0) {
        try {
          // wrangler prints version banners / config warnings on stdout
          // before the JSON array — extract the array first.
          const jsonText =
            extractJsonArray(stdout) ?? stripWranglerStdoutNoise(stdout);
          const namespaces = JSON.parse(jsonText) as Array<{
            id: string;
            title: string;
          }>;
          const configKv = namespaces.find((n) => n.title === "CONFIG_KV");
          if (configKv) return configKv.id;
        } catch {
          // Not JSON — skip
        }
      }
    } catch {
      // wrangler not available
    }

    throw new Error(
      "Could not resolve CONFIG_KV namespace ID. Provide --namespace-id flag."
    );
  }

  async list(namespaceId: string): Promise<Array<{ name: string }>> {
    const proc = Bun.spawn(
      ["wrangler", "kv", "key", "list", "--namespace-id", namespaceId],
      { stdout: "pipe", stderr: "pipe" }
    );
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(
        `Failed to list KV keys: ${stdout.trim() || `exit ${exitCode}`}`
      );
    }

    try {
      const parsed = JSON.parse(stdout) as Array<{ name: string }>;
      return parsed;
    } catch {
      return stdout
        .split("\n")
        .filter(Boolean)
        .map((name) => ({ name: name.trim() }));
    }
  }

  async get(namespaceId: string, key: string): Promise<string | null> {
    const proc = Bun.spawn(
      ["wrangler", "kv", "key", "get", "--namespace-id", namespaceId, key],
      { stdout: "pipe", stderr: "pipe" }
    );
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      if (stderr.includes("not found")) return null;
      throw new Error(
        `Failed to get key "${key}": ${stderr.trim() || `exit ${exitCode}`}`
      );
    }

    // wrangler may prefix version banners on stdout; take the cleaned payload.
    // For multi-line values after noise strip, join remaining lines.
    const cleaned = stripWranglerStdoutNoise(stdout);
    return cleaned.length > 0 ? cleaned : null;
  }

  async set(namespaceId: string, key: string, value: string): Promise<void> {
    const proc = Bun.spawn(
      ["wrangler", "kv", "key", "put", "--namespace-id", namespaceId, key],
      { stdout: "pipe", stderr: "pipe", stdin: "pipe" }
    );

    // Pipe the value through stdin — never via CLI args (avoids leaking
    // secrets via `ps`/process cmdline/shell history).
    proc.stdin.write(value + "\n");
    proc.stdin.end();

    const [, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(
        `Failed to set key "${key}": ${stderr.trim() || `exit ${exitCode}`}`
      );
    }
  }

  async delete(namespaceId: string, key: string): Promise<void> {
    const proc = Bun.spawn(
      ["wrangler", "kv", "key", "delete", "--namespace-id", namespaceId, key],
      { stdout: "pipe", stderr: "pipe" }
    );
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      throw new Error(
        `Failed to delete key "${key}": ${stderr.trim() || `exit ${exitCode}`}`
      );
    }
  }

  /**
   * CONFIG_KV key manifest derived dynamically from
   * workers/NAME/dashboard.jsonc (same source as the web dashboard and TUI).
   *
   * When `root` is omitted, resolves the monorepo via HOOX_REPO / cwd.
   * Throws if the root cannot be resolved (callers should not treat an empty
   * manifest as success when discovery failed). Explicit `root` may return
   * empty keys (e.g. tests against a temp dir with no workers).
   */
  static getManifest(root?: string | null): KvManifest {
    const resolved =
      root !== undefined && root !== null ? root : resolveManifestRoot();
    if (!resolved) {
      throw new Error(
        "Could not resolve monorepo root for dashboard.jsonc. " +
          "Set HOOX_REPO or run from the hoox checkout."
      );
    }
    return loadDashboardKvManifestFromRoot(resolved);
  }

  static getManifestKeys(root?: string | null): KvManifestKey[] {
    return KvSyncService.getManifest(root).keys;
  }

  /** Resolved monorepo root used for dashboard.jsonc discovery (null if none). */
  static resolveRoot(): string | null {
    return resolveManifestRoot();
  }
}
