/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox pyne` command group — PYNE edge evaluate worker (Python Cloudflare Worker).
 *
 * Subcommands:
 *   health        — Probe GET /health
 *   run           — POST /run with a .pine script (or inline source)
 *   scripts       — list / get / deploy / delete deployed scripts
 *   cron          — list jobs or trigger bar-close run
 *   feed          — refresh market feed into R2
 *   ingest        — fetch OHLCV via scripts/fetch_and_ingest.py
 *   sync-vendor   — sync pynescript into python_modules/ for deploy
 *   deploy        — sync-vendor + wrangler deploy
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { ConfigService } from "../../services/config/index.js";
import {
  formatJson,
  formatSuccess,
  getFormatOptions,
  type FormatOptions,
} from "../../utils/formatters.js";
import { withErrorHandling } from "../../utils/error-handler.js";
import { CLIError, ExitCode } from "../../utils/errors.js";

// ---------------------------------------------------------------------------
// Paths & helpers
// ---------------------------------------------------------------------------

const PYNE_WORKER_DIR = resolve(process.cwd(), "workers/pyne-worker");
const DEFAULT_TIMEOUT_MS = 30_000;

function requirePyneDir(): string {
  if (!existsSync(PYNE_WORKER_DIR)) {
    throw new CLIError(
      `pyne-worker directory not found: ${PYNE_WORKER_DIR}\n` +
        `  Clone it with: hoox clone pyne-worker\n` +
        `  Or: git submodule update --init workers/pyne-worker`,
      ExitCode.ERROR
    );
  }
  return PYNE_WORKER_DIR;
}

function loadDevVars(workerDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const candidates = [
    resolve(workerDir, ".dev.vars"),
    resolve(process.cwd(), ".dev.vars"),
  ];
  for (const filePath of candidates) {
    try {
      if (!existsSync(filePath)) continue;
      const content = readFileSync(filePath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && value && !out[key]) out[key] = value;
      }
    } catch {
      // ignore unreadable files
    }
  }
  return out;
}

async function resolvePyneBaseUrl(explicit?: string): Promise<string> {
  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, "");

  const envUrl =
    process.env.PYNE_WORKER_URL || process.env.HOOX_PYNE_URL || undefined;
  if (envUrl?.trim()) return envUrl.trim().replace(/\/+$/, "");

  try {
    const config = new ConfigService();
    await config.load();
    const global = config.getGlobal() as {
      subdomain_prefix?: string;
      cloudflare_account_id?: string;
    };
    const prefix = global.subdomain_prefix;
    if (prefix) return `https://pyne-worker.${prefix}.workers.dev`;
    const accountId =
      global.cloudflare_account_id || process.env.CLOUDFLARE_ACCOUNT_ID;
    if (accountId) return `https://pyne-worker.${accountId}.workers.dev`;
  } catch {
    // fall through
  }

  return "https://pyne-worker.cryptolinx.workers.dev";
}

function resolveApiKey(explicit?: string, workerDir?: string): string | null {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.PYNE_API_KEY?.trim()) return process.env.PYNE_API_KEY.trim();
  if (process.env.API_KEY?.trim()) return process.env.API_KEY.trim();
  if (workerDir) {
    const vars = loadDevVars(workerDir);
    if (vars.API_KEY) return vars.API_KEY;
    if (vars.PYNE_API_KEY) return vars.PYNE_API_KEY;
  }
  return null;
}

async function pyneFetch(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    apiKey?: string | null;
    body?: unknown;
    timeoutMs?: number;
  } = {}
): Promise<{ status: number; ok: boolean; json: unknown; text: string }> {
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.apiKey) {
    headers["X-API-Key"] = options.apiKey;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function printResult(data: unknown, fmt: FormatOptions): void {
  if (fmt.json) {
    process.stdout.write(formatJson(data) + "\n");
    return;
  }
  if (typeof data === "string") {
    process.stdout.write(data + (data.endsWith("\n") ? "" : "\n"));
    return;
  }
  process.stdout.write(formatJson(data) + "\n");
}

async function spawnInPyneDir(cmd: string[], cwd: string): Promise<number> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await proc.exited;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerPyneCommand(program: Command): void {
  const pyneCmd = program
    .command("pyne")
    .summary("PYNE edge evaluate worker (health, run, scripts, deploy)")
    .description(
      `Operate the Python pyne-worker isolate (Pine Script edge evaluate).

SUBCOMMANDS:
  health              Probe GET /health
  run <script>        POST /run with a .pine file (or - for stdin)
  scripts list|get|deploy|delete
  cron jobs|run       Bar-close jobs list / manual trigger
  feed refresh        Pull latest klines into R2
  ingest              Fetch OHLCV (scripts/fetch_and_ingest.py)
  sync-vendor         Sync pynescript → python_modules/ for deploy
  deploy              sync-vendor + wrangler deploy

Auth: X-API-Key from --api-key, PYNE_API_KEY / API_KEY env, or
workers/pyne-worker/.dev.vars.

URL: --url, PYNE_WORKER_URL, or https://pyne-worker.<subdomain_prefix>.workers.dev

EXAMPLES:
  hoox pyne health
  hoox pyne run ./strategy.pine --mode auto
  hoox pyne scripts list
  hoox pyne sync-vendor && hoox pyne deploy
  hoox pyne ingest -- --symbol BTCUSDT --timeframe 1d`
    );

  // -- health -----------------------------------------------------------------
  pyneCmd
    .command("health")
    .summary("Probe pyne-worker GET /health")
    .option("--url <url>", "Base URL for pyne-worker")
    .option("--timeout <ms>", "Probe timeout in ms", String(DEFAULT_TIMEOUT_MS))
    .action(
      withErrorHandling(
        async (opts: { url?: string; timeout?: string }, cmd) => {
          const fmt = getFormatOptions(cmd);
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const timeoutMs = Number(opts.timeout) || DEFAULT_TIMEOUT_MS;
          const started = Date.now();
          try {
            const res = await pyneFetch(baseUrl, "/health", { timeoutMs });
            const latencyMs = Date.now() - started;
            const payload = {
              worker: "pyne-worker",
              url: `${baseUrl}/health`,
              status: res.ok
                ? "healthy"
                : res.status >= 500
                  ? "down"
                  : "degraded",
              httpStatus: res.status,
              latencyMs,
              body: res.json ?? res.text,
            };
            if (!res.ok) process.exitCode = ExitCode.ERROR;
            if (fmt.json) {
              process.stdout.write(formatJson(payload) + "\n");
            } else {
              const icon = res.ok ? "ok" : "fail";
              formatSuccess(
                `pyne-worker ${icon} — HTTP ${res.status} in ${latencyMs}ms (${baseUrl})`,
                fmt
              );
              if (res.json) {
                process.stdout.write(formatJson(res.json) + "\n");
              }
            }
          } catch (err) {
            process.exitCode = ExitCode.ERROR;
            const message = err instanceof Error ? err.message : String(err);
            if (fmt.json) {
              process.stdout.write(
                formatJson({
                  worker: "pyne-worker",
                  url: `${baseUrl}/health`,
                  status: "down",
                  error: message,
                }) + "\n"
              );
            } else {
              throw new CLIError(
                `pyne-worker health failed: ${message}`,
                ExitCode.ERROR
              );
            }
          }
        }
      )
    );

  // -- run --------------------------------------------------------------------
  pyneCmd
    .command("run")
    .summary("Evaluate a Pine script via POST /run")
    .argument("<script-path>", "Path to .pine file, or - for stdin")
    .option("--url <url>", "Base URL for pyne-worker")
    .option(
      "--api-key <key>",
      "X-API-Key (else PYNE_API_KEY / API_KEY / .dev.vars)"
    )
    .option(
      "--mode <mode>",
      "interpret | compile | auto (default: auto)",
      "auto"
    )
    .option("--script-id <id>", "Use a deployed script_id instead of file body")
    .option("--timeout <ms>", "Request timeout ms", String(DEFAULT_TIMEOUT_MS))
    .action(
      withErrorHandling(
        async (
          scriptPath: string,
          opts: {
            url?: string;
            apiKey?: string;
            mode?: string;
            scriptId?: string;
            timeout?: string;
          },
          cmd
        ) => {
          const fmt = getFormatOptions(cmd);
          const dir = requirePyneDir();
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const apiKey = resolveApiKey(opts.apiKey, dir);
          if (!apiKey) {
            throw new CLIError(
              "API key required. Pass --api-key, set PYNE_API_KEY/API_KEY, or workers/pyne-worker/.dev.vars",
              ExitCode.INVALID_USAGE
            );
          }

          const body: Record<string, unknown> = {
            mode: opts.mode ?? "auto",
          };
          if (opts.scriptId) {
            body.script_id = opts.scriptId;
          } else if (scriptPath === "-") {
            body.script = await new Response(Bun.stdin).text();
          } else {
            const abs = resolve(process.cwd(), scriptPath);
            if (!existsSync(abs)) {
              throw new CLIError(`Script not found: ${abs}`, ExitCode.ERROR);
            }
            body.script = readFileSync(abs, "utf-8");
          }

          const res = await pyneFetch(baseUrl, "/run", {
            method: "POST",
            apiKey,
            body,
            timeoutMs: Number(opts.timeout) || DEFAULT_TIMEOUT_MS,
          });
          if (!res.ok) process.exitCode = ExitCode.ERROR;
          printResult(res.json ?? { status: res.status, body: res.text }, fmt);
        }
      )
    );

  // -- scripts ----------------------------------------------------------------
  const scriptsCmd = pyneCmd
    .command("scripts")
    .summary("Manage deployed Pine scripts on pyne-worker")
    .description(
      "list | get | deploy | delete deployed scripts in R2 registry"
    );

  scriptsCmd
    .command("list")
    .summary("List deployed scripts")
    .option("--url <url>", "Base URL")
    .option("--api-key <key>", "X-API-Key")
    .action(
      withErrorHandling(
        async (opts: { url?: string; apiKey?: string }, cmd) => {
          const fmt = getFormatOptions(cmd);
          const dir = requirePyneDir();
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const apiKey = resolveApiKey(opts.apiKey, dir);
          if (!apiKey) {
            throw new CLIError(
              "API key required for authenticated endpoints",
              ExitCode.INVALID_USAGE
            );
          }
          const res = await pyneFetch(baseUrl, "/scripts", { apiKey });
          if (!res.ok) process.exitCode = ExitCode.ERROR;
          printResult(res.json ?? res.text, fmt);
        }
      )
    );

  scriptsCmd
    .command("get")
    .summary("Get a deployed script by id")
    .argument("<id>", "script_id")
    .option("--url <url>", "Base URL")
    .option("--api-key <key>", "X-API-Key")
    .action(
      withErrorHandling(
        async (id: string, opts: { url?: string; apiKey?: string }, cmd) => {
          const fmt = getFormatOptions(cmd);
          const dir = requirePyneDir();
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const apiKey = resolveApiKey(opts.apiKey, dir);
          if (!apiKey) {
            throw new CLIError(
              "API key required for authenticated endpoints",
              ExitCode.INVALID_USAGE
            );
          }
          const res = await pyneFetch(
            baseUrl,
            `/scripts/${encodeURIComponent(id)}`,
            { apiKey }
          );
          if (!res.ok) process.exitCode = ExitCode.ERROR;
          printResult(res.json ?? res.text, fmt);
        }
      )
    );

  scriptsCmd
    .command("deploy")
    .summary("Deploy a .pine file to the R2 script registry")
    .argument("<script-path>", "Path to .pine file")
    .option("--id <id>", "script_id (default: basename without extension)")
    .option("--url <url>", "Base URL")
    .option("--api-key <key>", "X-API-Key")
    .action(
      withErrorHandling(
        async (
          scriptPath: string,
          opts: { id?: string; url?: string; apiKey?: string },
          cmd
        ) => {
          const fmt = getFormatOptions(cmd);
          const dir = requirePyneDir();
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const apiKey = resolveApiKey(opts.apiKey, dir);
          if (!apiKey) {
            throw new CLIError(
              "API key required for authenticated endpoints",
              ExitCode.INVALID_USAGE
            );
          }
          const abs = resolve(process.cwd(), scriptPath);
          if (!existsSync(abs)) {
            throw new CLIError(`Script not found: ${abs}`, ExitCode.ERROR);
          }
          const script = readFileSync(abs, "utf-8");
          const baseName = abs.split(/[/\\]/).pop() ?? "script.pine";
          const scriptId =
            opts.id ??
            baseName.replace(/\.pine$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
          const res = await pyneFetch(baseUrl, "/scripts", {
            method: "POST",
            apiKey,
            body: { script_id: scriptId, script },
          });
          if (!res.ok) process.exitCode = ExitCode.ERROR;
          if (!fmt.json && res.ok) {
            formatSuccess(`Deployed script_id=${scriptId}`, fmt);
          }
          printResult(res.json ?? res.text, fmt);
        }
      )
    );

  scriptsCmd
    .command("delete")
    .summary("Delete a deployed script")
    .argument("<id>", "script_id")
    .option("--url <url>", "Base URL")
    .option("--api-key <key>", "X-API-Key")
    .action(
      withErrorHandling(
        async (id: string, opts: { url?: string; apiKey?: string }, cmd) => {
          const fmt = getFormatOptions(cmd);
          const dir = requirePyneDir();
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const apiKey = resolveApiKey(opts.apiKey, dir);
          if (!apiKey) {
            throw new CLIError(
              "API key required for authenticated endpoints",
              ExitCode.INVALID_USAGE
            );
          }
          const res = await pyneFetch(
            baseUrl,
            `/scripts/${encodeURIComponent(id)}`,
            { method: "DELETE", apiKey }
          );
          if (!res.ok) process.exitCode = ExitCode.ERROR;
          if (!fmt.json && res.ok) {
            formatSuccess(`Deleted script_id=${id}`, fmt);
          }
          printResult(res.json ?? { deleted: id, status: res.status }, fmt);
        }
      )
    );

  scriptsCmd.action(() => {
    scriptsCmd.help();
  });

  // -- cron -------------------------------------------------------------------
  const cronCmd = pyneCmd
    .command("cron")
    .summary("Bar-close cron jobs")
    .description("List cron jobs or manually trigger the bar-close scheduler");

  cronCmd
    .command("jobs")
    .summary("List bar-close cron jobs")
    .option("--url <url>", "Base URL")
    .option("--api-key <key>", "X-API-Key")
    .action(
      withErrorHandling(
        async (opts: { url?: string; apiKey?: string }, cmd) => {
          const fmt = getFormatOptions(cmd);
          const dir = requirePyneDir();
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const apiKey = resolveApiKey(opts.apiKey, dir);
          if (!apiKey) {
            throw new CLIError(
              "API key required for authenticated endpoints",
              ExitCode.INVALID_USAGE
            );
          }
          const res = await pyneFetch(baseUrl, "/cron/jobs", { apiKey });
          if (!res.ok) process.exitCode = ExitCode.ERROR;
          printResult(res.json ?? res.text, fmt);
        }
      )
    );

  cronCmd
    .command("run")
    .summary("Manually trigger bar-close scheduler")
    .option("--url <url>", "Base URL")
    .option("--api-key <key>", "X-API-Key")
    .action(
      withErrorHandling(
        async (opts: { url?: string; apiKey?: string }, cmd) => {
          const fmt = getFormatOptions(cmd);
          const dir = requirePyneDir();
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const apiKey = resolveApiKey(opts.apiKey, dir);
          if (!apiKey) {
            throw new CLIError(
              "API key required for authenticated endpoints",
              ExitCode.INVALID_USAGE
            );
          }
          const res = await pyneFetch(baseUrl, "/cron/run", {
            method: "POST",
            apiKey,
            body: {},
          });
          if (!res.ok) process.exitCode = ExitCode.ERROR;
          printResult(res.json ?? res.text, fmt);
        }
      )
    );

  cronCmd.action(() => {
    cronCmd.help();
  });

  // -- feed -------------------------------------------------------------------
  const feedCmd = pyneCmd
    .command("feed")
    .summary("Market feed helpers")
    .description("Refresh live market feed into R2");

  feedCmd
    .command("refresh")
    .summary("Pull latest klines into R2")
    .option("--url <url>", "Base URL")
    .option("--api-key <key>", "X-API-Key")
    .action(
      withErrorHandling(
        async (opts: { url?: string; apiKey?: string }, cmd) => {
          const fmt = getFormatOptions(cmd);
          const dir = requirePyneDir();
          const baseUrl = await resolvePyneBaseUrl(opts.url);
          const apiKey = resolveApiKey(opts.apiKey, dir);
          if (!apiKey) {
            throw new CLIError(
              "API key required for authenticated endpoints",
              ExitCode.INVALID_USAGE
            );
          }
          const res = await pyneFetch(baseUrl, "/feed/refresh", {
            method: "POST",
            apiKey,
            body: {},
          });
          if (!res.ok) process.exitCode = ExitCode.ERROR;
          printResult(res.json ?? res.text, fmt);
        }
      )
    );

  feedCmd.action(() => {
    feedCmd.help();
  });

  // -- ingest -----------------------------------------------------------------
  pyneCmd
    .command("ingest")
    .summary("Fetch OHLCV via scripts/fetch_and_ingest.py")
    .description(
      `Runs workers/pyne-worker/scripts/fetch_and_ingest.py with remaining args.

Pass script flags after -- :
  hoox pyne ingest -- --symbol BTCUSDT --timeframe 1d
  hoox pyne ingest -- --symbol BTCUSDT --ingest-url https://… --api-key …`
    )
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(
      withErrorHandling(async (_opts, cmd) => {
        const dir = requirePyneDir();
        // Collect args after "ingest" from raw argv
        const raw = process.argv;
        const idx = raw.findIndex((a) => a === "ingest");
        const passthrough = idx >= 0 ? raw.slice(idx + 1) : [];
        // Drop commander flags that were already parsed if any
        const args = passthrough.filter((a) => a !== "--");
        process.exitCode = await spawnInPyneDir(
          ["python3", "scripts/fetch_and_ingest.py", ...args],
          dir
        );
        void cmd;
      })
    );

  // -- sync-vendor ------------------------------------------------------------
  pyneCmd
    .command("sync-vendor")
    .summary("Sync pynescript into python_modules/ for Cloudflare deploy")
    .description(
      `Runs workers/pyne-worker/scripts/sync_vendor.sh.
Required before wrangler deploy after pulling new PYNE APIs.`
    )
    .action(
      withErrorHandling(async () => {
        const dir = requirePyneDir();
        const script = resolve(dir, "scripts/sync_vendor.sh");
        if (!existsSync(script)) {
          throw new CLIError(
            `sync_vendor.sh not found at ${script}`,
            ExitCode.ERROR
          );
        }
        process.exitCode = await spawnInPyneDir(["bash", script], dir);
      })
    );

  // -- deploy -----------------------------------------------------------------
  pyneCmd
    .command("deploy")
    .summary("sync-vendor then wrangler deploy pyne-worker")
    .option("--skip-sync", "Skip scripts/sync_vendor.sh")
    .action(
      withErrorHandling(async (opts: { skipSync?: boolean }) => {
        const dir = requirePyneDir();
        if (!opts.skipSync) {
          const script = resolve(dir, "scripts/sync_vendor.sh");
          if (existsSync(script)) {
            const code = await spawnInPyneDir(["bash", script], dir);
            if (code !== 0) {
              process.exitCode = code;
              return;
            }
          }
        }
        process.exitCode = await spawnInPyneDir(
          ["bunx", "wrangler", "deploy"],
          dir
        );
      })
    );

  pyneCmd.action(() => {
    pyneCmd.help();
  });
}
