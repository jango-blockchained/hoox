/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { parse, printParseErrorCode } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";
import { join } from "node:path";
import {
  resolveHooxPath,
  getHooxWranglerPath,
} from "@jango-blockchained/hoox-shared";
import type { HooxConfig, WorkerConfig, GlobalConfig } from "./types";

/**
 * Structured error from `ConfigService.tryLoad()`.
 *
 * Each variant carries enough context for the caller to surface an
 * actionable error message (e.g. "wrangler.jsonc not found in
 * /home/user/hoox — run `hoox config init`") without re-parsing
 * an English string.
 */
export type ConfigError =
  /** The wrangler.jsonc file (and the cwd fallback) could not be located. */
  | { code: "not-found"; path: string; triedFallback: string }
  /** The file exists but contains invalid JSONC. */
  | { code: "invalid-jsonc"; path: string; errors: string[] }
  /** The file exists but the root is not a JSON object. */
  | { code: "not-object"; path: string };

/**
 * Typed Result for `ConfigService` — extends the shared `Result<T>` (which
 * only allows `string` errors) to carry a structured `ConfigError`. The
 * shape is otherwise identical to `@jango-blockchained/hoox-shared` →
 * `Result<T>` so callers can write the same `if (!r.ok)` checks.
 */
export type ConfigResult =
  | { ok: true; value: HooxConfig }
  | { ok: false; error: ConfigError };

/**
 * Loads, parses, and validates the central wrangler.jsonc configuration.
 *
 * Uses jsonc-parser for fault-tolerant JSONC parsing with native comment
 * support (both line and block comments). Provides typed accessors for the
 * global config and per-worker entries.
 *
 * Supports a fallback chain that prefers the $HOME/.hoox home directory
 * over the current working directory. This enables cloned repos located
 * at $HOME/.hoox to be referenced without being in that directory.
 *
 * @example
 * ```ts
 * const config = new ConfigService();
 * const r = await config.tryLoad();
 * if (!r.ok) {
 *   // handle ConfigError here, no try/catch needed
 * } else {
 *   console.log(r.value.listEnabledWorkers());
 * }
 * ```
 */
export class ConfigService {
  private config: HooxConfig | null = null;
  private configPath: string;
  private homeDirOverride: string | undefined;

  /**
   * @param configPath - Absolute or relative path to wrangler.jsonc.
   *   Defaults to `wrangler.jsonc` in the current working directory.
   * @param homeDir - Optional override for the Hoox home directory
   *   (for testing or custom installations). When provided, the service
   *   uses this as the $HOME/.hoox base instead of the system home.
   */
  constructor(configPath?: string, homeDir?: string) {
    this.configPath = configPath ?? "wrangler.jsonc";
    this.homeDirOverride = homeDir;
  }

  /**
   * Resolve the best config file path using the fallback chain:
   *   $HOME/.hoox/config/wrangler.jsonc → ./wrangler.jsonc
   *
   * If an explicit configPath was provided in the constructor, it is
   * returned directly (no fallback) for backward compatibility.
   *
   * @returns The resolved config file path.
   */
  getConfigPath(): string {
    // If an explicit path was provided, use it directly (backward compat)
    if (this.configPath !== "wrangler.jsonc") {
      return this.configPath;
    }
    // Prefer home directory config: $HOME/.hoox/config/wrangler.jsonc
    try {
      if (this.homeDirOverride) {
        return join(this.homeDirOverride, ".hoox", "config", "wrangler.jsonc");
      }
      return getHooxWranglerPath();
    } catch {
      return this.configPath;
    }
  }

  /**
   * Resolve the path for a worker directory using the home-first strategy:
   *   $HOME/.hoox/workers/<name> → ./workers/<name>
   *
   * @param workerName - The worker name (e.g., "d1-worker").
   * @returns The resolved worker directory path.
   */
  getWorkerPath(workerName: string): string {
    // Prefer home directory workers
    try {
      if (this.homeDirOverride) {
        return join(this.homeDirOverride, ".hoox", "workers", workerName);
      }
      return resolveHooxPath(join("workers", workerName));
    } catch {
      return join("workers", workerName);
    }
  }

  /**
   * Read and parse wrangler.jsonc from disk, returning a `Result` rather
   * than throwing. New code should prefer this over `load()` so error
   * paths are explicit at the call site.
   *
   * Uses a fallback chain: attempts $HOME/.hoox/config/wrangler.jsonc first,
   * then falls back to ./wrangler.jsonc in the current directory (or the
   * custom configPath if one was provided).
   *
   * @param configPath - Override the path set in the constructor.
   */
  async tryLoad(configPath?: string): Promise<ConfigResult> {
    // Determine candidate paths to try in order
    const explicitPath = configPath ?? null;
    const filePath = explicitPath ?? this.getConfigPath();
    let resolvedPath = filePath;

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      // Fallback chain: only when using default resolution (no explicit path
      // provided to constructor or load()), try cwd as fallback.
      const isDefaultResolution =
        !explicitPath && this.configPath === "wrangler.jsonc";
      const cwdFallback = "wrangler.jsonc";

      if (isDefaultResolution && filePath !== cwdFallback) {
        const fallbackFile = Bun.file(cwdFallback);
        if (await fallbackFile.exists()) {
          resolvedPath = cwdFallback;
        } else {
          return {
            ok: false,
            error: {
              code: "not-found",
              path: filePath,
              triedFallback: cwdFallback,
            },
          };
        }
      } else {
        return {
          ok: false,
          error: {
            code: "not-found",
            path: filePath,
            triedFallback: "",
          },
        };
      }
    }

    // Update stored path to the resolved location
    this.configPath = resolvedPath;

    // Read the resolved config file
    const resolvedFile = Bun.file(resolvedPath);
    const content = await resolvedFile.text();
    const errors: ParseError[] = [];
    const raw: unknown = parse(content, errors);

    if (errors.length > 0) {
      return {
        ok: false,
        error: {
          code: "invalid-jsonc",
          path: resolvedPath,
          errors: errors.map(
            (e) =>
              `${printParseErrorCode(e.error)} at offset ${e.offset} (length ${e.length})`
          ),
        },
      };
    }

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        error: {
          code: "not-object",
          path: resolvedPath,
        },
      };
    }

    this.config = raw as HooxConfig;
    return { ok: true, value: this.config };
  }

  /**
   * Read and parse wrangler.jsonc from disk.
   *
   * Backward-compatible wrapper around `tryLoad()`. **Throws** on any
   * ConfigError with an English message — useful for code paths that
   * don't want to handle errors explicitly (most existing callers).
   *
   * @deprecated Prefer `tryLoad()` for new code. The `Result` type makes
   *   error handling explicit at the call site.
   *
   * @param configPath - Override the path set in the constructor.
   * @returns The parsed HooxConfig object.
   */
  async load(configPath?: string): Promise<HooxConfig> {
    const result = await this.tryLoad(configPath);
    if (!result.ok) {
      const e = result.error;
      switch (e.code) {
        case "not-found":
          throw new Error(
            e.triedFallback
              ? `Config file not found: ${e.path}. Also tried: ${e.triedFallback}. Run 'hoox config init' to create one.`
              : `Config file not found: ${e.path}. Run 'hoox config init' to create one.`
          );
        case "invalid-jsonc":
          throw new Error(
            `Invalid JSONC in ${e.path}:\n${e.errors.map((m: string) => `  - ${m}`).join("\n")}`
          );
        case "not-object":
          throw new Error(`${e.path} must contain a JSON object at the root`);
      }
    }
    return result.value;
  }

  /**
   * Get the configuration for a specific worker by name.
   *
   * @param name - The worker key as defined in wrangler.jsonc (e.g. "d1-worker").
   * @returns The worker config, or undefined if not found.
   */
  getWorker(name: string): WorkerConfig | undefined {
    const config = this.ensureLoaded();
    return config.workers[name];
  }

  /**
   * Get the global configuration section.
   */
  getGlobal(): GlobalConfig {
    const config = this.ensureLoaded();
    return config.global;
  }

  /**
   * List all worker names defined in wrangler.jsonc (enabled + disabled).
   */
  listWorkers(): string[] {
    const config = this.ensureLoaded();
    return Object.keys(config.workers);
  }

  /**
   * List only enabled worker names.
   */
  listEnabledWorkers(): string[] {
    const config = this.ensureLoaded();
    return Object.entries(config.workers)
      .filter(([, w]) => w.enabled)
      .map(([name]) => name);
  }

  /**
   * Validate the loaded configuration against required fields.
   *
   * Required fields:
   *   - global.cloudflare_account_id
   *   - Each worker must have a `path` property
   *
   * @returns An object with `valid` and an `errors` array.
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config) {
      return {
        valid: false,
        errors: ["Config not loaded. Call load() first."],
      };
    }

    // Global required fields
    if (!this.config.global?.cloudflare_account_id) {
      errors.push(
        "Required field missing: global.cloudflare_account_id — must be set in wrangler.jsonc"
      );
    }

    // Worker required fields
    if (!this.config.workers || Object.keys(this.config.workers).length === 0) {
      errors.push("No workers defined in wrangler.jsonc");
    } else {
      for (const [name, worker] of Object.entries(this.config.workers)) {
        if (!worker.path) {
          errors.push(`Worker "${name}" is missing required field: path`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get the preferred dev runtime from config ("native" or "docker").
   */
  getDevRuntime(): "native" | "docker" | null {
    return this.ensureLoaded().dev?.runtime ?? null;
  }

  /**
   * Persist the dev runtime preference to wrangler.jsonc.
   *
   * Reads the current file, updates the dev.runtime field, and writes it
   * back. Preserves JSONC comments where possible.
   */
  async setDevRuntime(runtime: "native" | "docker"): Promise<void> {
    const filePath = this.configPath;
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new Error(`Config file not found: ${filePath}`);
    }

    const raw = await file.text();
    const errors: ParseError[] = [];
    const parsed = parse(raw, errors);

    if (
      errors.length > 0 ||
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(`Invalid JSONC in ${filePath}`);
    }

    const config = parsed as Record<string, unknown>;
    if (!config.dev) {
      config.dev = {};
    }
    (config.dev as Record<string, unknown>).runtime = runtime;

    // Write back as regular JSON (jsonc-parser doesn't support round-trip comment preservation)
    await Bun.write(filePath, JSON.stringify(config, null, 2) + "\n");
  }

  /**
   * Guard: throws if config hasn't been loaded yet; returns the loaded config.
   */
  private ensureLoaded(): HooxConfig {
    if (!this.config) {
      throw new Error(
        "Config not loaded. Call load() before accessing configuration."
      );
    }
    return this.config;
  }
}
