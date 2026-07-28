/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { parse as parseJsonc } from "jsonc-parser";
import { sanitizeWranglerOutput } from "../../utils/wrangler-output.js";
import type {
  Result,
  SecretCheckResult,
  SecretStatus,
  SecretSyncItem,
  SecretSyncResult,
  SyncSecretsOptions,
  WorkersJsonc,
} from "./types.js";

/**
 * System / mesh secrets — auto-generated internal auth and gateway keys.
 *
 * These are required for workers to talk to each other and for webhook
 * ingress. Exchange API keys, bot tokens, and other integration secrets
 * are *not* included; use plain `hoox secrets sync` for those.
 */
export const SYSTEM_SECRET_NAMES = [
  "INTERNAL_KEY_BINDING",
  "AGENT_INTERNAL_KEY",
  "WEBHOOK_API_KEY_BINDING",
  "TELEGRAM_INTERNAL_KEY_BINDING",
  "SESSION_SECRET",
  "TRADE_INTERNAL_KEY",
  "API_SERVICE_KEY_BINDING",
] as const;

const SYSTEM_SECRET_SET = new Set<string>(SYSTEM_SECRET_NAMES);

/** True when `name` is a system/mesh secret (see {@link SYSTEM_SECRET_NAMES}). */
export function isSystemSecret(name: string): boolean {
  return SYSTEM_SECRET_SET.has(name);
}

/**
 * Manages Cloudflare Worker secrets defined in `wrangler.jsonc`.
 *
 * Reads worker-level `secrets` arrays, checks local `.dev.vars` files,
 * syncs secrets to Cloudflare via `wrangler secret put`, and generates
 * `.dev.vars` templates.
 *
 * Use the static `create()` factory to instantiate — the constructor
 * is private so the config is parsed once and the sync methods remain
 * synchronous.
 *
 * @example
 * ```ts
 * const svc = await SecretsService.create("wrangler.jsonc");
 * const names = svc.listSecrets("trade-worker");
 * const check = await svc.checkLocalSecrets("trade-worker");
 * ```
 */
export class SecretsService {
  private config: WorkersJsonc;

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  /** Use {@link create} instead — private so config is always loaded. */
  private constructor(config: WorkersJsonc, _configPath: string) {
    this.config = config;
  }

  /**
   * Factory that reads and parses the wrangler.jsonc config file.
   * Throws if the file doesn't exist or can't be parsed.
   */
  static async create(configPath?: string): Promise<SecretsService> {
    const path = configPath ?? "wrangler.jsonc";
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new Error(`Config file not found: ${path}`);
    }
    const text = await file.text();
    const config = parseJsonc(text) as WorkersJsonc;
    return new SecretsService(config, path);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Returns secret names declared for a worker in `wrangler.jsonc`.
   * Synchronous because the config was loaded during construction.
   */
  listSecrets(workerName: string): string[] {
    const worker = this.config.workers[workerName];
    return worker?.secrets ?? [];
  }

  /**
   * Returns a map of every worker → its declared secret names.
   * Workers that declare no secrets are omitted from the result.
   */
  listAllSecrets(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [name, worker] of Object.entries(this.config.workers)) {
      if (worker.secrets && worker.secrets.length > 0) {
        result[name] = worker.secrets;
      }
    }
    return result;
  }

  /**
   * Checks a worker's local `.dev.vars` file and reports which secrets
   * are set (with real, non-placeholder values) and which are missing.
   */
  async checkLocalSecrets(workerName: string): Promise<SecretCheckResult> {
    const worker = this.config.workers[workerName];
    if (!worker) {
      return {
        worker: workerName,
        secrets: [],
        allSet: false,
        missing: [],
      };
    }

    const requiredSecrets = worker.secrets ?? [];
    const devVarsPath = `${worker.path}/.dev.vars`;
    const file = Bun.file(devVarsPath);

    if (!(await file.exists())) {
      return {
        worker: workerName,
        secrets: requiredSecrets.map((s) => ({ name: s, set: false })),
        allSet: requiredSecrets.length === 0,
        missing: [...requiredSecrets],
      };
    }

    const content = await file.text();
    const secretMap = this.parseDotEnv(content);

    const secrets: SecretStatus[] = [];
    const missing: string[] = [];

    for (const name of requiredSecrets) {
      const value = secretMap.get(name);
      if (value !== undefined && !this.isPlaceholder(value)) {
        secrets.push({ name, set: true, source: devVarsPath });
      } else {
        secrets.push({
          name,
          set: false,
          source: value !== undefined ? devVarsPath : undefined,
        });
        missing.push(name);
      }
    }

    return {
      worker: workerName,
      secrets,
      allSet: missing.length === 0,
      missing,
    };
  }

  /**
   * Creates (or overwrites) a `.dev.vars` template file for a worker
   * with placeholder values for every secret declared in `wrangler.jsonc`.
   */
  async generateDevVars(workerName: string): Promise<Result<string>> {
    const worker = this.config.workers[workerName];
    if (!worker) {
      return {
        ok: false,
        error: `Worker "${workerName}" not found in config`,
      };
    }

    const secrets = worker.secrets ?? [];
    const content =
      secrets.length > 0
        ? secrets.map((s) => `${s}=placeholder_${s.toLowerCase()}`).join("\n") +
          "\n"
        : "";
    const devVarsPath = `${worker.path}/.dev.vars`;

    try {
      await Bun.write(devVarsPath, content);
      return { ok: true, value: devVarsPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to write .dev.vars: ${message}` };
    }
  }

  /**
   * Syncs a worker's secrets to Cloudflare via `wrangler secret put`.
   *
   * Returns a structured {@link SecretSyncResult}:
   * - **synced** — successfully put
   * - **skipped** — no value / placeholder (or non-system under `--system`)
   * - **failed** — wrangler put threw
   *
   * `result.ok` is true when `failed` is empty. Placeholder skips for
   * non-system secrets under full sync still set `ok: false` so CI notices
   * incomplete configs; under `systemOnly`, only system secrets matter.
   *
   * Pass `{ systemOnly: true }` (CLI `--system` / `--required`) to sync mesh
   * keys (from declared list **or** present in `.dev.vars`).
   */
  async syncToCloudflare(
    workerName: string,
    options: SyncSecretsOptions = {}
  ): Promise<Result<SecretSyncResult>> {
    const worker = this.config.workers[workerName];
    if (!worker) {
      return {
        ok: false,
        error: `Worker "${workerName}" not found in config`,
      };
    }

    const declared = worker.secrets ?? [];
    const devVarsPath = `${worker.path}/.dev.vars`;
    const devVarsFile = Bun.file(devVarsPath);
    let existingValues: Map<string, string> = new Map();

    if (await devVarsFile.exists()) {
      const content = await devVarsFile.text();
      existingValues = this.parseDotEnv(content);
    }

    // Candidate names: declared secrets, or under --system also mesh keys
    // present in .dev.vars (covers keys generate → per-worker .dev.vars even
    // when root wrangler.jsonc omits them from the secrets array).
    let secrets: string[];
    if (options.systemOnly) {
      const fromDeclared = declared.filter((s) => isSystemSecret(s));
      const fromDevVars = [...SYSTEM_SECRET_NAMES].filter((s) =>
        existingValues.has(s)
      );
      secrets = [...new Set([...fromDeclared, ...fromDevVars])];
    } else {
      secrets = declared;
    }

    const synced: string[] = [];
    const skipped: SecretSyncItem[] = [];
    const failed: SecretSyncItem[] = [];
    const items: SecretSyncItem[] = [];

    for (const secret of secrets) {
      try {
        const value = existingValues.get(secret);
        if (value !== undefined && !this.isPlaceholder(value)) {
          await this.execWranglerSecretPut(worker.path, secret, value);
          synced.push(secret);
          items.push({ name: secret, status: "synced" });
        } else {
          const reason =
            value === undefined
              ? "missing in .dev.vars"
              : "placeholder / empty value";
          const item: SecretSyncItem = {
            name: secret,
            status: "skipped",
            reason,
          };
          skipped.push(item);
          items.push(item);
        }
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        const reason = sanitizeWranglerOutput(raw);
        const item: SecretSyncItem = {
          name: secret,
          status: "failed",
          reason,
        };
        failed.push(item);
        items.push(item);
      }
    }

    // Under systemOnly, skipped system secrets are failures for the operator
    // (they expected mesh keys to land). Under full sync, any skip/fail of a
    // declared secret is a problem — report ok=false when work remains.
    const blockingSkips = options.systemOnly
      ? skipped.filter((s) => isSystemSecret(s.name))
      : skipped;

    const result: SecretSyncResult = {
      worker: workerName,
      ok: failed.length === 0 && blockingSkips.length === 0,
      synced,
      skipped,
      failed,
      items,
    };

    // Always return ok:true at Result level with structured payload so callers
    // can render partial success. Use result.ok for exit code policy.
    return { ok: true, value: result };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Parses a `.env` / `.dev.vars` style file into a `Map<key, value>`.
   * Skips empty lines and comments (lines starting with `#`).
   */
  private parseDotEnv(content: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;

      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;

      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      map.set(key, value);
    }
    return map;
  }

  /** Returns `true` when a value looks like an unfilled template. */
  private isPlaceholder(value: string): boolean {
    const v = value.trim();
    return (
      v === "" ||
      v.startsWith("placeholder_") ||
      v.startsWith("your_") ||
      v.startsWith("generate_") ||
      v.startsWith("<") ||
      v.includes("generate-with")
    );
  }

  /**
   * Runs `wrangler secret put <name>` inside the worker's directory.
   * Marked `protected` so unit tests can stub it without touching the
   * real `Bun.spawn`.
   */
  protected async execWranglerSecretPut(
    workerPath: string,
    name: string,
    value: string
  ): Promise<void> {
    const proc = Bun.spawn(["wrangler", "secret", "put", name], {
      cwd: workerPath,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(value + "\n");
    proc.stdin.end();

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderrText = await new Response(proc.stderr).text();
      const cleaned = sanitizeWranglerOutput(stderrText);
      throw new Error(
        `wrangler secret put failed (exit ${exitCode}): ${cleaned}`
      );
    }
  }
}

export default SecretsService;
