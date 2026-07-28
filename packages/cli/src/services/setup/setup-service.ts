/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SetupService — reusable core logic for `hoox setup`.
 *
 * Exports a class with methods for each setup step (generate keys, apply D1
 * schema, set Cloudflare secrets, rebuild dashboard) plus a `runAll()` method
 * that executes them in sequence with optional per-step skipping.
 *
 * The service uses an optional `onProgress` callback to report progress and
 * results. Callers (CLI command, TUI, init wizard) can wire this to a spinner,
 * logger, or progress bar.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CloudflareService } from "../cloudflare/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedKeys {
  INTERNAL_KEY_BINDING: string;
  AGENT_INTERNAL_KEY: string;
  SESSION_SECRET: string;
  WEBHOOK_API_KEY_BINDING: string;
  TELEGRAM_INTERNAL_KEY_BINDING: string;
  /** Shared mesh key alias used by dashboard → trade-worker auth. */
  TRADE_INTERNAL_KEY: string;
  /** Mesh API service key (trade-worker + dashboard). */
  API_SERVICE_KEY_BINDING: string;
}

export interface SetupOptions {
  skipKeys?: boolean;
  skipDb?: boolean;
  skipSecrets?: boolean;
  skipDashboard?: boolean;
  dryRun?: boolean;
  database?: string;
}

export interface SecretResult {
  worker: string;
  secret: string;
  ok: boolean;
  error?: string;
}

export interface SetupStepResult {
  step: string;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface SetupResult {
  success: boolean;
  steps: SetupStepResult[];
  keys?: GeneratedKeys;
  secrets?: SecretResult[];
}

/**
 * Progress callback type — called at various stages during setup.
 * Consumers can wire this to a spinner, logger, or progress bar.
 */
export interface ProgressEvent {
  type:
    | "step-start"
    | "step-complete"
    | "step-error"
    | "secret-start"
    | "secret-done"
    | "secret-error"
    | "info"
    | "warn"
    | "error";
  step?: string;
  message: string;
  worker?: string;
  secret?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All workers that need INTERNAL_KEY_BINDING. */
const ALL_WORKERS = [
  "d1-worker",
  "analytics-worker",
  "trade-worker",
  "report-worker",
  "email-worker",
  "agent-worker",
  "hoox",
  "web3-wallet-worker",
  "telegram-worker",
] as const;

/**
 * Secret-to-workers mapping for auto-generated secrets.
 * Aligned with SYSTEM_SECRET_NAMES, env-service worker maps, and
 * wrangler.jsonc.example secret declarations.
 */
const SECRET_WORKER_MAP: Record<string, readonly string[]> = {
  INTERNAL_KEY_BINDING: ALL_WORKERS,
  AGENT_INTERNAL_KEY: ["agent-worker", "dashboard"],
  SESSION_SECRET: ["dashboard"],
  WEBHOOK_API_KEY_BINDING: ["hoox"],
  TELEGRAM_INTERNAL_KEY_BINDING: ["trade-worker"],
  // env-service + wrangler: trade-worker; dashboard also declares it for outbound calls
  API_SERVICE_KEY_BINDING: ["trade-worker", "dashboard"],
  // env-service + wrangler: dashboard only (trade alias for execute auth)
  TRADE_INTERNAL_KEY: ["dashboard"],
};

/** Which secrets each worker should get in .dev.vars. */
const DEV_VARS_WORKER_KEYS: Record<string, (keyof GeneratedKeys)[]> = {
  "d1-worker": ["INTERNAL_KEY_BINDING"],
  "analytics-worker": ["INTERNAL_KEY_BINDING"],
  "trade-worker": [
    "INTERNAL_KEY_BINDING",
    "TELEGRAM_INTERNAL_KEY_BINDING",
    "API_SERVICE_KEY_BINDING",
  ],
  "report-worker": ["INTERNAL_KEY_BINDING"],
  "email-worker": ["INTERNAL_KEY_BINDING"],
  "agent-worker": ["INTERNAL_KEY_BINDING", "AGENT_INTERNAL_KEY"],
  hoox: ["INTERNAL_KEY_BINDING", "WEBHOOK_API_KEY_BINDING"],
  "web3-wallet-worker": ["INTERNAL_KEY_BINDING"],
  "telegram-worker": ["INTERNAL_KEY_BINDING"],
  dashboard: [
    "AGENT_INTERNAL_KEY",
    "SESSION_SECRET",
    "TRADE_INTERNAL_KEY",
    "API_SERVICE_KEY_BINDING",
  ],
};

/**
 * Cloudflare worker name → monorepo directory under `workers/`.
 * Most workers match; gateway is published as `hoox` but lives in `hoox-worker/`.
 */
const WORKER_FS_DIR: Record<string, string> = {
  hoox: "hoox-worker",
};

/** Filesystem directory for a logical worker name (under `workers/`). */
function workerFsDir(worker: string): string {
  return WORKER_FS_DIR[worker] ?? worker;
}

const KEYS_DIR = ".keys";

/** Escape a string for use in a RegExp literal. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SetupService {
  private onProgress: ProgressCallback;
  private cf: CloudflareService;

  constructor(onProgress?: ProgressCallback, cf?: CloudflareService) {
    this.onProgress = onProgress ?? (() => {});
    this.cf = cf ?? new CloudflareService();
  }

  // ── Key Generation ─────────────────────────────────────────────────────

  /**
   * Generate cryptographically random keys and persist them to `.keys/` and
   * to each worker's `.dev.vars` file.
   *
   * @returns The generated keys (or null if skipped).
   */
  async generateKeys(skip = false): Promise<GeneratedKeys | null> {
    if (skip) {
      this.onProgress({ type: "info", step: "keys", message: "Skipped" });
      return null;
    }

    this.onProgress({
      type: "step-start",
      step: "keys",
      message: "Generating keys...",
    });

    // Shared mesh key strategy: one internal key for all inter-worker auth
    // aliases (INTERNAL / AGENT / TELEGRAM / TRADE / API_SERVICE). SESSION
    // and WEBHOOK stay distinct.
    const internalKey = this._randomHex(32);
    const keys: GeneratedKeys = {
      INTERNAL_KEY_BINDING: internalKey,
      AGENT_INTERNAL_KEY: internalKey,
      SESSION_SECRET: this._randomHex(64),
      WEBHOOK_API_KEY_BINDING: this._randomHex(32),
      TELEGRAM_INTERNAL_KEY_BINDING: internalKey,
      TRADE_INTERNAL_KEY: internalKey,
      API_SERVICE_KEY_BINDING: internalKey,
    };

    // Ensure .keys directory exists
    if (!existsSync(KEYS_DIR)) {
      mkdirSync(KEYS_DIR, { recursive: true });
    } else if (!statSync(KEYS_DIR).isDirectory()) {
      mkdirSync(KEYS_DIR, { recursive: true });
    }

    // Write combined setup.env
    const envLines = Object.entries(keys).map(([k, v]) => `${k}=${v}`);
    await Bun.write(
      join(KEYS_DIR, "setup.env"),
      "# Hoox Setup — Auto-Generated Keys\n" +
        "# Generated by `hoox setup`. NEVER commit this file.\n" +
        `# Created: ${new Date().toISOString()}\n\n` +
        envLines.join("\n") +
        "\n"
    );

    // Write individual key files
    for (const [name, value] of Object.entries(keys)) {
      await Bun.write(
        join(KEYS_DIR, `${name.toLowerCase()}.env`),
        `${name}=${value}\n`
      );
    }

    // Write .dev.vars for each worker
    let devVarsCount = 0;
    for (const [worker, secretNames] of Object.entries(DEV_VARS_WORKER_KEYS)) {
      const path = `workers/${workerFsDir(worker)}/.dev.vars`;
      let content = `# .dev.vars — local secrets for ${worker}\n`;
      content += `# Generated by \`hoox setup\`. NEVER commit this file.\n\n`;
      for (const secretName of secretNames) {
        content += `${secretName}=${keys[secretName]}\n`;
      }
      await Bun.write(path, content);
      devVarsCount++;
    }

    this.onProgress({
      type: "step-complete",
      step: "keys",
      message: `Keys saved to ${KEYS_DIR}/setup.env + ${devVarsCount} .dev.vars files`,
    });

    return keys;
  }

  // ── D1 Schema ──────────────────────────────────────────────────────────

  /**
   * Apply D1 schema to the specified database.
   *
   * @param dbName  Database name (default: trade-data-db)
   * @param skip    If true, skip this step
   */
  async applySchema(
    dbName = "trade-data-db",
    skip = false
  ): Promise<SetupStepResult> {
    if (skip) {
      return {
        step: "d1-schema",
        success: true,
        message: "Skipped",
      };
    }

    this.onProgress({
      type: "step-start",
      step: "d1-schema",
      message: `Applying schema to "${dbName}"...`,
    });

    const schemaPath = "workers/trade-worker/schema.sql";
    const schemaFile = Bun.file(schemaPath);

    if (!(await schemaFile.exists())) {
      const msg = `Schema file not found: ${schemaPath}`;
      this.onProgress({ type: "warn", step: "d1-schema", message: msg });
      return { step: "d1-schema", success: false, message: msg };
    }

    try {
      const proc = Bun.spawn(
        ["wrangler", "d1", "execute", dbName, "--file", schemaPath, "--remote"],
        { stdout: "pipe", stderr: "pipe" }
      );

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        throw new Error(
          stderr.trim() || `wrangler exited with code ${exitCode}`
        );
      }

      this.onProgress({
        type: "step-complete",
        step: "d1-schema",
        message: `Schema applied to "${dbName}"`,
      });

      return {
        step: "d1-schema",
        success: true,
        message: `Schema applied to "${dbName}"`,
        details: { output: stdout.slice(0, 300) },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onProgress({ type: "step-error", step: "d1-schema", message: msg });
      return { step: "d1-schema", success: false, message: msg };
    }
  }

  // ── Secrets ────────────────────────────────────────────────────────────

  /**
   * Set all auto-generated secrets on the appropriate workers.
   *
   * @param keys  The generated keys (if null/undefined, step is skipped)
   */
  async setSecrets(keys?: GeneratedKeys | null): Promise<SecretResult[]> {
    if (!keys) {
      this.onProgress({
        type: "info",
        step: "secrets",
        message: "Skipped (no keys)",
      });
      return [];
    }

    this.onProgress({
      type: "step-start",
      step: "secrets",
      message: "Setting Cloudflare secrets...",
    });

    const results: SecretResult[] = [];

    for (const [secretName, workers] of Object.entries(SECRET_WORKER_MAP)) {
      const value = keys[secretName as keyof GeneratedKeys];
      if (!value) continue;

      for (const worker of workers) {
        this.onProgress({
          type: "secret-start",
          step: "secrets",
          worker,
          secret: secretName,
          message: `Setting ${secretName} on ${worker}...`,
        });

        try {
          const result = await this._putSecretWithRetry(
            worker,
            secretName,
            value
          );
          results.push({
            worker,
            secret: secretName,
            ok: result.ok,
            error: result.ok ? undefined : result.error,
          });

          if (result.ok) {
            this.onProgress({
              type: "secret-done",
              step: "secrets",
              worker,
              secret: secretName,
              message: `${worker}: ${secretName} set`,
            });
          } else {
            this.onProgress({
              type: "secret-error",
              step: "secrets",
              worker,
              secret: secretName,
              message: `${worker}: ${secretName} failed — ${result.error}`,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ worker, secret: secretName, ok: false, error: msg });
          this.onProgress({
            type: "secret-error",
            step: "secrets",
            worker,
            secret: secretName,
            message: `${worker}: ${secretName} failed — ${msg}`,
          });
        }
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    this.onProgress({
      type: "step-complete",
      step: "secrets",
      message: `${okCount} set, ${failed} failed`,
    });

    return results;
  }

  /**
   * Try to set a secret. If it fails with "binding already in use" (code 10053),
   * check whether the worker's wrangler.jsonc has the secret name as a null
   * var — if so, remove the null var, deploy, and retry.
   */
  private async _putSecretWithRetry(
    worker: string,
    secretName: string,
    value: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    // First attempt
    const first = await this.cf.secretPut(worker, secretName, value);
    if (first.ok) return { ok: true };

    const errMsg = first.error ?? "";

    // Only auto-remediate "binding already in use" — pass through other errors
    if (!errMsg.includes("already in use")) {
      return { ok: false, error: errMsg };
    }

    // Check wrangler.jsonc for a null var with this name
    const wranglerPath = join("workers", workerFsDir(worker), "wrangler.jsonc");
    let wranglerContent: string;
    try {
      wranglerContent = readFileSync(wranglerPath, "utf-8");
    } catch {
      // Can't read wrangler.jsonc — report original error
      return { ok: false, error: errMsg };
    }

    // Pattern: match `"INTERNAL_KEY_BINDING":` (with optional whitespace)
    // followed by `null` somewhere on the same logical line (before `,` or `}`)
    const nullVarPattern = new RegExp(
      `"${escapeRegex(secretName)}"\\s*:\\s*null\\s*[,}]`
    );

    if (!nullVarPattern.test(wranglerContent)) {
      // Not caused by a null var — report original error
      return { ok: false, error: errMsg };
    }

    this.onProgress({
      type: "info",
      step: "secrets",
      worker,
      secret: secretName,
      message: `Detected null var "${secretName}" in ${wranglerPath} — auto-remediating...`,
    });

    // Remove the null var and its preceding comment line (if any)
    let fixed = wranglerContent.replace(
      // Match: optional comment line + optional whitespace + `"NAME": null,`
      new RegExp(
        `(\\s*//[^\\n]*\\n)?\\s*"${escapeRegex(secretName)}"\\s*:\\s*null\\s*,?\\s*\\n?`,
        "g"
      ),
      "\n"
    );

    // If vars is now empty `"vars": {  \n}` clean it up to `"vars": {}`
    fixed = fixed.replace(/"vars"\s*:\s*\{\s*\}/, '"vars": {}');

    writeFileSync(wranglerPath, fixed, "utf-8");

    this.onProgress({
      type: "info",
      step: "secrets",
      worker,
      secret: secretName,
      message: `Fixed ${wranglerPath} — deploying to clear stale binding...`,
    });

    // Deploy the worker to push updated config to Cloudflare
    const deployResult = await this.cf.deploy(`workers/${workerFsDir(worker)}`);
    if (!deployResult.ok) {
      return {
        ok: false,
        error: `Fixed null var but deploy failed: ${deployResult.error}`,
      };
    }

    this.onProgress({
      type: "info",
      step: "secrets",
      worker,
      secret: secretName,
      message: `Deployed ${worker} — retrying secret...`,
    });

    // Retry the secret put
    const retry = await this.cf.secretPut(worker, secretName, value);
    return retry.ok
      ? { ok: true }
      : { ok: false, error: `Retry failed: ${retry.error}` };
  }

  // ── Dashboard ──────────────────────────────────────────────────────────

  /**
   * Rebuild and deploy the dashboard (OpenNext build + deploy).
   *
   * @param skip  If true, skip this step
   */
  async rebuildDashboard(skip = false): Promise<SetupStepResult> {
    if (skip) {
      return { step: "dashboard", success: true, message: "Skipped" };
    }

    const dashboardDir = "workers/dashboard";

    // Check directory exists (Bun.file().exists() doesn't work on directories)
    try {
      if (!statSync(dashboardDir).isDirectory()) {
        const msg = `Not a directory: ${dashboardDir}`;
        this.onProgress({ type: "warn", step: "dashboard", message: msg });
        return { step: "dashboard", success: false, message: msg };
      }
    } catch {
      const msg = `Dashboard directory not found: ${dashboardDir}`;
      this.onProgress({ type: "warn", step: "dashboard", message: msg });
      return { step: "dashboard", success: false, message: msg };
    }

    this.onProgress({
      type: "step-start",
      step: "dashboard",
      message: "Building dashboard...",
    });

    // Build
    try {
      const buildProc = Bun.spawn(["bunx", "opennextjs-cloudflare", "build"], {
        cwd: dashboardDir,
        stdout: "pipe",
        stderr: "pipe",
      });

      const buildExit = await buildProc.exited;
      const buildStderr = await new Response(buildProc.stderr).text();

      if (buildExit !== 0) {
        throw new Error(
          buildStderr.trim() || `Build exited with code ${buildExit}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onProgress({ type: "step-error", step: "dashboard", message: msg });
      return {
        step: "dashboard",
        success: false,
        message: `Build failed: ${msg}`,
      };
    }

    this.onProgress({
      type: "info",
      step: "dashboard",
      message: "Build complete, deploying...",
    });

    // Deploy
    try {
      const deployProc = Bun.spawn(
        ["bunx", "opennextjs-cloudflare", "deploy"],
        {
          cwd: dashboardDir,
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      const deployExit = await deployProc.exited;
      const deployStderr = await new Response(deployProc.stderr).text();

      if (deployExit !== 0) {
        throw new Error(
          deployStderr.trim() || `Deploy exited with code ${deployExit}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onProgress({ type: "step-error", step: "dashboard", message: msg });
      return {
        step: "dashboard",
        success: false,
        message: `Deploy failed: ${msg}`,
      };
    }

    this.onProgress({
      type: "step-complete",
      step: "dashboard",
      message: "Dashboard built and deployed",
    });

    return {
      step: "dashboard",
      success: true,
      message: "Dashboard built and deployed",
    };
  }

  // ── Auto-Fix: Wrangler Install ────────────────────────────────────────

  /**
   * Ensure `wrangler` is available on PATH. Auto-installs via `bun install -g wrangler`
   * if missing. Returns true once wrangler is available.
   */
  async ensureWrangler(): Promise<boolean> {
    this.onProgress({
      type: "step-start",
      step: "wrangler",
      message: "Checking wrangler...",
    });

    // Check if wrangler is already on PATH
    const which = Bun.spawnSync(["which", "wrangler"], { stdout: "pipe" });
    if (which.exitCode === 0) {
      this.onProgress({
        type: "step-complete",
        step: "wrangler",
        message: `wrangler found: ${which.stdout.toString().trim()}`,
      });
      return true;
    }

    // Try common fallback locations
    const fallbacks = [
      "/usr/local/bin/wrangler",
      join(homedir(), ".bun", "bin", "wrangler"),
    ];
    for (const fb of fallbacks) {
      try {
        const test = Bun.spawnSync([fb, "--version"], { stdout: "pipe" });
        if (test.exitCode === 0) {
          this.onProgress({
            type: "info",
            step: "wrangler",
            message: `Found wrangler at ${fb} (not on PATH)`,
          });
          return true;
        }
      } catch {
        // fallback path invalid
      }
    }

    this.onProgress({
      type: "info",
      step: "wrangler",
      message:
        "wrangler not found — auto-installing via `bun install -g wrangler`...",
    });

    const install = Bun.spawnSync(["bun", "install", "-g", "wrangler"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (install.exitCode !== 0) {
      const err = install.stderr.toString().trim();
      this.onProgress({
        type: "step-error",
        step: "wrangler",
        message: `Auto-install failed: ${err}`,
      });
      return false;
    }

    this.onProgress({
      type: "step-complete",
      step: "wrangler",
      message: "wrangler installed globally",
    });
    return true;
  }

  // ── Auto-Fix: Worker Submodules ────────────────────────────────────────

  /**
   * Ensure all worker directories are cloned (git submodules). If any worker
   * directory is empty, runs `git submodule update --init --recursive`.
   *
   * Returns a list of workers that were cloned (empty = none needed).
   */
  async ensureWorkers(): Promise<string[]> {
    this.onProgress({
      type: "step-start",
      step: "workers",
      message: "Checking worker submodules...",
    });

    const workerDirs = [...ALL_WORKERS, "dashboard"];

    const missing: string[] = [];
    const gitmodulesPath = ".gitmodules";

    for (const name of workerDirs) {
      const dir = `workers/${name}`;
      // Empty submodule = directory exists but has no files
      try {
        const entries = readFileSync(join(dir, ".git"), "utf-8").trim();
        // A submodule .git is a file containing "gitdir:" — it exists but points elsewhere
        if (entries.startsWith("gitdir:")) {
          // Check if the work-tree is populated
          const contents = readFileSync(join(dir, "src", "index.ts"), "utf-8");
          // If we can read source, submodule is populated
          void contents;
        }
      } catch {
        // Either .git file missing or src/index.ts missing — submodule not populated
        missing.push(name);
      }
    }

    if (missing.length === 0) {
      this.onProgress({
        type: "step-complete",
        step: "workers",
        message: "All workers present",
      });
      return [];
    }

    this.onProgress({
      type: "warn",
      step: "workers",
      message: `${missing.length} worker(s) not cloned: ${missing.join(", ")}`,
    });

    // Check if .gitmodules exists (this IS a submodule-aware repo)
    if (!existsSync(gitmodulesPath)) {
      this.onProgress({
        type: "step-error",
        step: "workers",
        message: "No .gitmodules found — cannot auto-clone",
      });
      return missing;
    }

    this.onProgress({
      type: "info",
      step: "workers",
      message: "Running `git submodule update --init --recursive`...",
    });

    const update = Bun.spawnSync(
      ["git", "submodule", "update", "--init", "--recursive"],
      { stdout: "pipe", stderr: "pipe" }
    );

    if (update.exitCode !== 0) {
      this.onProgress({
        type: "step-error",
        step: "workers",
        message: `Submodule update failed: ${update.stderr.toString().trim()}`,
      });
      return missing;
    }

    this.onProgress({
      type: "step-complete",
      step: "workers",
      message: `${missing.length} worker(s) cloned`,
    });

    return missing;
  }

  // ── Auto-Fix: Package Builds ──────────────────────────────────────────

  /**
   * Ensure the CLI package is built. If `dist/` is missing, runs `bun run build`
   * in `packages/cli`. Also ensures `packages/shared` is built.
   */
  async ensurePackages(): Promise<boolean> {
    this.onProgress({
      type: "step-start",
      step: "packages",
      message: "Checking package builds...",
    });

    const packages = [
      { name: "packages/shared", dist: "packages/shared/dist" },
      { name: "packages/cli", dist: "packages/cli/dist" },
    ];

    const toBuild: string[] = [];

    for (const pkg of packages) {
      try {
        const jsFiles = readFileSync(pkg.dist, "utf-8");
        if (!jsFiles.includes(".js")) {
          toBuild.push(pkg.name);
        }
      } catch {
        toBuild.push(pkg.name);
      }
    }

    if (toBuild.length === 0) {
      this.onProgress({
        type: "step-complete",
        step: "packages",
        message: "All packages built",
      });
      return true;
    }

    this.onProgress({
      type: "info",
      step: "packages",
      message: `Building: ${toBuild.join(", ")}`,
    });

    // Build shared first (CLI depends on it)
    if (toBuild.includes("packages/shared")) {
      const shared = Bun.spawnSync(["bun", "run", "build"], {
        cwd: "packages/shared",
        stdout: "pipe",
        stderr: "pipe",
      });
      if (shared.exitCode !== 0) {
        this.onProgress({
          type: "step-error",
          step: "packages",
          message: `packages/shared build failed: ${shared.stderr.toString().trim()}`,
        });
        return false;
      }
    }

    if (toBuild.includes("packages/cli")) {
      const cli = Bun.spawnSync(["bun", "run", "build"], {
        cwd: "packages/cli",
        stdout: "pipe",
        stderr: "pipe",
      });
      if (cli.exitCode !== 0) {
        this.onProgress({
          type: "step-error",
          step: "packages",
          message: `packages/cli build failed: ${cli.stderr.toString().trim()}`,
        });
        return false;
      }
    }

    this.onProgress({
      type: "step-complete",
      step: "packages",
      message: `${toBuild.length} package(s) built`,
    });

    return true;
  }

  // ── Auto-Fix: Null Vars in wrangler.jsonc ─────────────────────────────

  /**
   * Scan ALL worker wrangler.jsonc files for null vars that shadow secret
   * names we're about to set. Remove them proactively so `wrangler secret put`
   * doesn't hit "already in use".
   *
   * Returns the list of workers whose configs were fixed.
   */
  fixWranglerConfigs(): string[] {
    this.onProgress({
      type: "step-start",
      step: "configs",
      message: "Scanning wrangler.jsonc for null vars...",
    });

    const fixed: string[] = [];

    for (const worker of ALL_WORKERS) {
      const wranglerPath = `workers/${workerFsDir(worker)}/wrangler.jsonc`;
      let content: string;
      try {
        content = readFileSync(wranglerPath, "utf-8");
      } catch {
        continue; // Can't read — skip this worker
      }

      // Check for ANY `. + : null` pattern in vars section
      // (matches `"ANY_NAME": null` inside vars)
      const nullVarRegex = /"vars"\s*:\s*\{([^}]*)\}/s;
      const varsMatch = content.match(nullVarRegex);
      if (!varsMatch) continue;

      const varsBlock = varsMatch[1];
      const nullEntries = varsBlock.match(/"\w+"\s*:\s*null/g);
      if (!nullEntries) continue;

      // Remove each null var + preceding comment
      let modified = false;
      for (const entry of nullEntries || []) {
        const keyName = entry.match(/"(\w+)"/)?.[1];
        if (!keyName) continue;

        const escName = escapeRegex(keyName);
        const replacement = content.replace(
          new RegExp(
            `(\\s*//[^\\n]*\\n)?\\s*"${escName}"\\s*:\\s*null\\s*,?\\s*\\n?`,
            "g"
          ),
          "\n"
        );

        if (replacement !== content) {
          content = replacement;
          modified = true;
          this.onProgress({
            type: "info",
            step: "configs",
            message: `Removed null var "${keyName}" from ${wranglerPath}`,
          });
        }
      }

      if (modified) {
        // Clean up empty vars
        content = content.replace(/"vars"\s*:\s*\{\s*\}/, '"vars": {}');
        writeFileSync(wranglerPath, content, "utf-8");
        fixed.push(worker);
      }
    }

    const count = fixed.length;
    this.onProgress({
      type: "step-complete",
      step: "configs",
      message:
        count > 0
          ? `Fixed ${count} worker(s): ${fixed.join(", ")}`
          : "All configs clean",
    });

    return fixed;
  }

  // ── Auto-Fix: D1 Database ─────────────────────────────────────────────

  /**
   * Creates the D1 database if it doesn't exist, then applies the schema.
   * Idempotent — safe to run multiple times.
   */
  async ensureD1Database(dbName = "trade-data-db"): Promise<SetupStepResult> {
    this.onProgress({
      type: "step-start",
      step: "d1-database",
      message: `Checking D1 database "${dbName}"...`,
    });

    // Check if database exists
    const listResult = await this.cf.d1List();
    if (listResult.ok) {
      try {
        const databases: Array<{ name: string }> = JSON.parse(listResult.value);
        const exists = databases.some((d) => d.name === dbName);

        if (!exists) {
          this.onProgress({
            type: "info",
            step: "d1-database",
            message: `Database "${dbName}" not found — creating...`,
          });

          const createResult = await this.cf.d1Create(dbName);
          if (!createResult.ok) {
            const msg = `Failed to create D1 database: ${createResult.error}`;
            this.onProgress({
              type: "step-error",
              step: "d1-database",
              message: msg,
            });
            return { step: "d1-database", success: false, message: msg };
          }

          this.onProgress({
            type: "info",
            step: "d1-database",
            message: `Created D1 database "${dbName}"`,
          });
        }
      } catch {
        // Can't parse JSON — assume it exists
      }
    }

    this.onProgress({
      type: "step-complete",
      step: "d1-database",
      message: `D1 database "${dbName}" ready`,
    });

    return {
      step: "d1-database",
      success: true,
      message: `D1 database "${dbName}" ready`,
    };
  }

  // ── Auto-Fix: Secret Reconciliation ────────────────────────────────────

  /**
   * Detect and fix wrong/legacy secret names. For example, if a worker has
   * `INTERNAL_SERVICE_KEY` set but the expected name is `INTERNAL_KEY_BINDING`,
   * this will delete the wrong one (and warn about any code references).
   *
   * Currently handles:
   *   - d1-worker: `INTERNAL_SERVICE_KEY` → `INTERNAL_KEY_BINDING` (legacy rename)
   */
  async reconcileSecrets(keys: GeneratedKeys): Promise<{
    fixed: string[];
    warnings: string[];
  }> {
    this.onProgress({
      type: "step-start",
      step: "reconcile",
      message: "Reconciling secret names...",
    });

    const fixed: string[] = [];
    const warnings: string[] = [];

    // ── Legacy key rewrites ────────────────────────────────────────────
    // Map: worker → [ [oldName, newName] ]
    const legacyMap: Record<string, [string, string][]> = {
      "d1-worker": [["INTERNAL_SERVICE_KEY", "INTERNAL_KEY_BINDING"]],
    };

    for (const [worker, renames] of Object.entries(legacyMap)) {
      const listResult = await this.cf.secretList(worker);
      if (!listResult.ok) continue;

      try {
        const secrets: Array<{ name: string; type: string }> = JSON.parse(
          listResult.value
        );

        for (const [oldName, newName] of renames) {
          const hasOld = secrets.some((s) => s.name === oldName);
          if (!hasOld) continue;

          const newValue = keys[newName as keyof GeneratedKeys];
          if (!newValue) continue;

          // Check if the NEW name already has the correct value
          const hasNew = secrets.some((s) => s.name === newName);
          if (hasNew) {
            // Both old and new exist — delete the old one
            this.onProgress({
              type: "info",
              step: "reconcile",
              message: `Cleaning up legacy secret "${oldName}" on ${worker}...`,
            });
            await this.cf.secretDelete(worker, oldName);
            fixed.push(`${worker}:${oldName}→deleted`);
            warnings.push(
              `Deleted legacy secret "${oldName}" from ${worker} — was replaced by "${newName}"`
            );
          } else {
            // Old name exists but new doesn't — set the new one, delete old
            this.onProgress({
              type: "info",
              step: "reconcile",
              message: `Migrating "${oldName}" → "${newName}" on ${worker}...`,
            });
            const putResult = await this.cf.secretPut(
              worker,
              newName,
              newValue
            );
            if (putResult.ok) {
              await this.cf.secretDelete(worker, oldName);
              fixed.push(`${worker}:${oldName}→${newName}`);
            } else {
              warnings.push(
                `Could not migrate "${oldName}" to "${newName}" on ${worker}: ${putResult.error}`
              );
            }
          }
        }
      } catch {
        // Can't parse secret list — skip
      }
    }

    const count = fixed.length;
    this.onProgress({
      type: "step-complete",
      step: "reconcile",
      message:
        count > 0
          ? `Reconciled ${count} secret(s): ${fixed.join(", ")}`
          : "No reconciliation needed",
    });

    return { fixed, warnings };
  }

  // ── Post-Flight Verification ──────────────────────────────────────────

  /**
   * Verify that all generated secrets are set on all expected workers.
   * Reports any missing or mismatched secrets as warnings.
   */
  async verifySetup(keys: GeneratedKeys | null): Promise<{
    ok: boolean;
    missing: string[];
    warnings: string[];
  }> {
    this.onProgress({
      type: "step-start",
      step: "verify",
      message: "Verifying setup...",
    });

    const missing: string[] = [];
    const warnings: string[] = [];

    if (!keys) {
      this.onProgress({
        type: "warn",
        step: "verify",
        message: "No keys to verify against",
      });
      return { ok: false, missing, warnings };
    }

    // Check Cloudflare secrets for each worker
    for (const [secretName, workers] of Object.entries(SECRET_WORKER_MAP)) {
      for (const worker of workers) {
        const listResult = await this.cf.secretList(worker);
        if (!listResult.ok) {
          missing.push(`${worker}:${secretName} (cannot list secrets)`);
          continue;
        }

        try {
          const secrets: Array<{ name: string }> = JSON.parse(listResult.value);
          const hasSecret = secrets.some((s) => s.name === secretName);

          if (!hasSecret) {
            missing.push(`${worker}:${secretName}`);
          }
        } catch {
          missing.push(`${worker}:${secretName} (parse error)`);
        }
      }
    }

    // Check .dev.vars files
    for (const [worker, secretNames] of Object.entries(DEV_VARS_WORKER_KEYS)) {
      const devVarsPath = `workers/${workerFsDir(worker)}/.dev.vars`;
      let devVarsContent: string;
      try {
        devVarsContent = readFileSync(devVarsPath, "utf-8");
      } catch {
        missing.push(`${worker}:.dev.vars (missing file)`);
        continue;
      }

      for (const secretName of secretNames) {
        const expected = keys[secretName];
        const line = devVarsContent
          .split("\n")
          .find((l) => l.startsWith(`${secretName}=`));
        if (!line) {
          missing.push(`${worker}:.dev.vars (missing ${secretName})`);
        } else if (line.split("=")[1] !== expected) {
          warnings.push(`${worker}:.dev.vars (${secretName} value mismatch)`);
        }
      }
    }

    // Check legacy secrets that should be cleaned up
    const legacyChecks: Record<string, string[]> = {
      "d1-worker": ["INTERNAL_SERVICE_KEY"],
    };
    for (const [worker, legacyNames] of Object.entries(legacyChecks)) {
      const listResult = await this.cf.secretList(worker);
      if (!listResult.ok) continue;
      try {
        const secrets: Array<{ name: string }> = JSON.parse(listResult.value);
        for (const legacy of legacyNames) {
          if (secrets.some((s) => s.name === legacy)) {
            warnings.push(`${worker} still has legacy secret "${legacy}"`);
          }
        }
      } catch {
        // skip
      }
    }

    const ok = missing.length === 0;
    if (ok && warnings.length === 0) {
      this.onProgress({
        type: "step-complete",
        step: "verify",
        message: "All checks passed",
      });
    } else if (ok) {
      this.onProgress({
        type: "step-complete",
        step: "verify",
        message: `All secrets present (${warnings.length} warning(s))`,
      });
    } else {
      this.onProgress({
        type: "step-error",
        step: "verify",
        message: `${missing.length} missing, ${warnings.length} warning(s)`,
      });
    }

    return { ok, missing, warnings };
  }

  // ── Run All ─────────────────────────────────────────────────────────────

  /**
   * Run the full setup in sequence: pre-flight checks → keys → D1 schema →
   * secrets → dashboard → post-flight verification.
   *
   * Every step auto-detects and fixes issues before proceeding.
   *
   * @param options  SetupOptions controlling which steps to run/skip
   * @returns        Aggregate result with per-step details
   */
  async runAll(options: SetupOptions = {}): Promise<SetupResult> {
    const steps: SetupStepResult[] = [];
    const results: SetupResult = { success: true, steps };

    // ── 0. Pre-flight auto-repair ──────────────────────────────────────
    // These run even when "skipped" — they fix fundamental issues blocking everything else

    // 0a. Ensure wrangler binary is available (auto-install if missing)
    const wranglerOk = await this.ensureWrangler();
    if (!wranglerOk) {
      steps.push({
        step: "wrangler",
        success: false,
        message:
          "wrangler not available — install manually: bun install -g wrangler",
      });
      results.success = false;
      return results;
    }

    // 0b. Ensure worker submodules are cloned
    const cloned = await this.ensureWorkers();
    if (cloned.length > 0) {
      this.onProgress({
        type: "warn",
        step: "workers",
        message: "Run `hoox setup` again after clone completes.",
      });
    }

    // 0c. Ensure packages are built
    const built = await this.ensurePackages();
    if (!built) {
      steps.push({
        step: "packages",
        success: false,
        message: "Package build failed — check dependencies",
      });
    }

    // 0d. Fix wrangler configs (null vars → secrets)
    this.fixWranglerConfigs();

    // ── 1. Keys (auto-generate if missing) ─────────────────────────────
    const keys = await this.generateKeys(options.skipKeys);
    results.keys = keys ?? undefined;

    // ── 2. D1 Database + Schema ────────────────────────────────────────
    const dbName = options.database ?? "trade-data-db";
    const skipDb = options.skipDb;

    if (!skipDb) {
      // 2a. Ensure D1 database exists (create if missing)
      const dbResult = await this.ensureD1Database(dbName);
      steps.push(dbResult);

      // 2b. Apply schema
      if (dbResult.success) {
        const schemaResult = await this.applySchema(dbName, false);
        steps.push(schemaResult);
      }
    } else {
      steps.push({ step: "d1-schema", success: true, message: "Skipped" });
    }

    // ── 3. Secret Reconciliation ───────────────────────────────────────
    // Migrate legacy secret names BEFORE setting new ones
    if (keys) {
      const reconcile = await this.reconcileSecrets(keys);
      if (reconcile.warnings.length > 0) {
        for (const w of reconcile.warnings) {
          this.onProgress({ type: "warn", step: "reconcile", message: w });
        }
      }
    }

    // ── 4. Secrets ─────────────────────────────────────────────────────
    const secretResults = await this.setSecrets(keys);
    results.secrets = secretResults;
    const secretOk = secretResults.filter((r) => r.ok).length;
    const secretFail = secretResults.filter((r) => !r.ok).length;
    steps.push({
      step: "secrets",
      success: secretFail === 0,
      message: `${secretOk} set, ${secretFail} failed`,
      details: {
        total: secretResults.length,
        ok: secretOk,
        failed: secretFail,
      },
    });

    // ── 5. Dashboard ──────────────────────────────────────────────────
    const dashResult = await this.rebuildDashboard(options.skipDashboard);
    steps.push(dashResult);

    // ── 6. Post-flight verification ────────────────────────────────────
    if (keys) {
      const verify = await this.verifySetup(keys);
      if (!verify.ok) {
        const missingList = verify.missing.join(", ");
        this.onProgress({
          type: "warn",
          step: "verify",
          message: `Missing: ${missingList}`,
        });
      }
      if (verify.warnings.length > 0) {
        for (const w of verify.warnings) {
          this.onProgress({ type: "warn", step: "verify", message: w });
        }
      }
      steps.push({
        step: "verify",
        success: verify.ok,
        message: verify.ok
          ? "All checks passed"
          : `${verify.missing.length} missing, ${verify.warnings.length} warning(s)`,
      });
    }

    // Overall success
    results.success = steps.every((s) => s.success);
    return results;
  }

  // ── Prerequisites ──────────────────────────────────────────────────────

  /**
   * Check Cloudflare authentication.
   *
   * @returns true if authenticated and wrangler is available.
   */
  async checkAuth(): Promise<boolean> {
    try {
      const result = await this.cf.whoami();
      return result.ok;
    } catch {
      return false;
    }
  }

  // ── Private ────────────────────────────────────────────────────────────

  /** Generate a cryptographically random hex string. */
  private _randomHex(bytes: number): string {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export default SetupService;
