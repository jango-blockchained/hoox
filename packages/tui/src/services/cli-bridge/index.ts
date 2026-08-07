/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CliBridge — Spawns the hoox CLI binary and returns structured results.
 *
 * Provides convenience methods for all CLI operations used by TUI views,
 * with configurable timeout, abort support, and stderr streaming.
 *
 * Every `CliResult` now carries `command` (the exact command string) and
 * `errorType` (a `CliErrorType` classification) so the status bar can
 * surface actionable diagnostics instead of a generic OFFLINE message.
 *
 * Global error sink: callers (e.g. the app root) can register an
 * `onError` listener once via `cliBridge.onError(fn)` and receive a
 * structured `CliErrorDetails` payload for **every** failed command —
 * not just the ones the caller explicitly invoked. This is the wiring
 * point that lets the status bar surface the real diagnostic context
 * for any CLI failure, regardless of which view triggered it.
 */
import * as path from "path";
import { getHooxRepoPath, resolveHooxRuntimeRoot } from "@hoox-sh/hoox-shared";
import type { CliResult, CliErrorType, CliErrorDetails } from "../../types";
import type {
  ExecOptions,
  KillSwitchAction,
  KillSwitchStatus,
  QueueDepthStatus,
  QueueDepth,
  DbQueryResult,
  SecretMetadata,
  SecretsSnapshot,
  KvKey,
  KvKeySnapshot,
  ModelHealth,
  AgentHealthResult,
  PyneHealthResult,
} from "./types";
import { validateReadOnlySql } from "./standalone";
import { tuiDevLog } from "../dev-log";

/** Cap stderr/stdout capture per command to keep the store lightweight. */
const MAX_OUTPUT_CHARS = 4096;

/** Default max depth for visualization (clamps the fill-bar). */
const DEFAULT_QUEUE_MAX = 1000;
/** Heuristic scale: assume each producer is responsible for ~100 msgs. */
const DEPTH_PER_PRODUCER = 100;
/** Status thresholds (see {@link QueueDepthStatus} for semantics). */
const HEALTHY_THRESHOLD = 100;
const CRITICAL_THRESHOLD = 500;

/**
 * Convert the structured JSON envelope emitted by `wrangler d1 execute
 * --json` into a normalized {@link DbQueryResult}. Unknown records are
 * skipped; the function never throws on malformed input.
 *
 * Expected envelope shape (one element, the success envelope):
 *   [ { "results": [ {...}, {...} ], "success": true,
 *       "meta": { "duration": 0.123, "rows_read": 42, ... } } ]
 */
function parseDbQueryResult(stdout: string): DbQueryResult {
  const cleaned = stdout.trim();
  if (!cleaned) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: null,
      meta: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: null,
      meta: null,
    };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: null,
      meta: null,
    };
  }

  // The first envelope is the one we care about.
  const envelope = parsed[0];
  if (!envelope || typeof envelope !== "object") {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: null,
      meta: null,
    };
  }

  const env = envelope as {
    results?: unknown;
    success?: unknown;
    meta?: unknown;
  };

  // If wrangler reported success=false, still surface the row data — the
  // error message is already in the bridge's stderr field.
  const rowsRaw = env.results;
  if (!Array.isArray(rowsRaw)) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: null,
      meta: null,
    };
  }

  const rows: Record<string, unknown>[] = [];
  for (const r of rowsRaw) {
    if (r && typeof r === "object" && !Array.isArray(r)) {
      rows.push(r as Record<string, unknown>);
    }
  }

  // Derive column order from the first row's keys.
  const columns =
    rows.length > 0 && rows[0] !== null ? Object.keys(rows[0]) : [];

  // wrangler's `meta.duration` is reported in seconds (float). Convert to ms.
  let executionTimeMs: number | null = null;
  let meta: Record<string, unknown> | null = null;
  if (env.meta && typeof env.meta === "object" && !Array.isArray(env.meta)) {
    meta = env.meta as Record<string, unknown>;
    const duration = (meta as { duration?: unknown }).duration;
    if (typeof duration === "number" && Number.isFinite(duration)) {
      // Always non-negative; cap at 24h to avoid display glitches.
      const ms = Math.max(0, duration * 1000);
      executionTimeMs = ms < 86_400_000 ? ms : null;
    }
  }

  return {
    columns,
    rows,
    rowCount: rows.length,
    executionTimeMs,
    meta,
  };
}

/** Compute the {@link QueueDepthStatus} for a given depth + paused flag. */
function deriveQueueDepthStatus(
  depth: number,
  paused: boolean
): QueueDepthStatus {
  if (paused) return "paused";
  if (depth < HEALTHY_THRESHOLD) return "healthy";
  if (depth <= CRITICAL_THRESHOLD) return "backlogged";
  return "critical";
}

/**
 * Convert the structured JSON envelope emitted by the CLI's
 * `hoox monitor queue-depth --json` command into a normalized
 * {@link QueueDepth} array. Unknown queue names are skipped;
 * the bridge never throws on malformed input.
 *
 * Expected envelope shape:
 *   { "queues": [ { "queue_name": "...", "producers_total_count": 2, ... } ] }
 */
function parseQueueDepths(stdout: string): QueueDepth[] {
  const timestamp = new Date().toISOString();
  const cleaned = stdout.trim();
  if (!cleaned) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("queues" in parsed) ||
    !Array.isArray((parsed as { queues: unknown }).queues)
  ) {
    return [];
  }

  const records = (parsed as { queues: WranglerQueueRecord[] }).queues;
  const result: QueueDepth[] = [];

  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const name = record.queue_name ?? record.queue_id;
    if (typeof name !== "string" || name.length === 0) continue;

    const producers =
      typeof record.producers_total_count === "number"
        ? record.producers_total_count
        : 0;
    const consumers =
      typeof record.consumers_total_count === "number"
        ? record.consumers_total_count
        : 0;
    const paused = record.settings?.delivery_paused === true;

    // Heuristic depth — see QueueDepthStatus doc-comment for rationale.
    const depth = paused
      ? DEFAULT_QUEUE_MAX
      : Math.max(0, producers * DEPTH_PER_PRODUCER);

    result.push({
      queueName: name,
      depth,
      max: DEFAULT_QUEUE_MAX,
      status: deriveQueueDepthStatus(depth, paused),
      producers,
      consumers,
      paused,
      timestamp,
    });
  }

  return result;
}

/**
 * Parse the JSON output emitted by `hoox config secrets list --json`.
 *
 * The CLI emits one of two shapes:
 *   - Single worker: { worker: string, secrets: string[] }
 *   - All workers: Record<string, string[]>
 *
 * This parser accepts both and normalizes to a flat SecretMetadata array.
 * Values are intentionally omitted — the viewer is strictly read-only.
 * The parser never throws on malformed input.
 */
function parseSecretsList(stdout: string): SecretMetadata[] {
  const cleaned = stdout.trim();
  if (!cleaned) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  // Single-worker envelope: { worker: string, secrets: string[] }
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "worker" in parsed &&
    "secrets" in parsed
  ) {
    const envelope = parsed as { worker: string; secrets: unknown };
    if (Array.isArray(envelope.secrets)) {
      const result: SecretMetadata[] = [];
      for (const item of envelope.secrets) {
        if (typeof item === "string") {
          result.push({
            name: item,
            type: inferSecretType(item),
            source: "config",
          });
        }
      }
      return result;
    }
    return [];
  }

  // All-workers envelope: Record<string, string[]>
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>);
    const result: SecretMetadata[] = [];
    for (const [, value] of entries) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") {
            result.push({
              name: item,
              type: inferSecretType(item),
              source: "config",
            });
          }
        }
      }
    }
    return result;
  }

  return [];
}

/**
 * Infer the secret type from its name using naming conventions.
 * Cloudflare secrets store does not expose per-secret type metadata,
 * so we derive it from the key name suffix.
 */
function inferSecretType(name: string): SecretMetadata["type"] {
  const lower = name.toLowerCase();
  if (lower.includes("key") || lower.includes("api")) return "api_key";
  if (lower.includes("token")) return "token";
  if (lower.includes("password") || lower.includes("passwd")) return "password";
  if (lower.includes("secret")) return "secret";
  return "unknown";
}

/**
 * Subset of the KV manifest row shape that we care about for the viewer.
 * Mirrors the row from `hoox config kv manifest --json`; the bridge
 * always treats every field as optional so it tolerates future schema
 * changes or wrangler not being installed.
 */
interface KvManifestRecord {
  key?: string;
  type?: "boolean" | "number" | "string";
  secret?: boolean;
}

/**
 * Subset of the wrangler key-listing record shape we care about.
 * We treat every field as optional so we degrade gracefully when fields
 * are missing or wrangler changes its schema.
 */
interface WranglerKeyRecord {
  name?: string;
  metadata?: { value_size?: number; last_modified?: string } | null;
}

/**
 * Parse the JSON output emitted by `hoox config kv list --json` and merge
 * it with manifest metadata to flag secret keys.
 *
 * The CLI emits one of two shapes:
 *   - Array form: `[ { "name": "..." }, ... ]` (current)
 *   - Envelope form: `{ "keys": [ { "name": "..." }, ... ] }` (future-proof)
 *
 * This parser accepts both. Unknown rows are skipped; the parser never
 * throws on malformed input — it returns an empty `keys` array instead.
 */
function parseKvList(
  stdout: string,
  manifest: Map<
    string,
    { type: "boolean" | "number" | "string"; secret: boolean }
  >
): KvKey[] {
  const cleaned = stdout.trim();
  if (!cleaned) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  let records: unknown;
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (
    parsed !== null &&
    typeof parsed === "object" &&
    "keys" in parsed &&
    Array.isArray((parsed as { keys: unknown }).keys)
  ) {
    records = (parsed as { keys: unknown }).keys;
  } else {
    return [];
  }

  const list = records as WranglerKeyRecord[];
  const result: KvKey[] = [];
  for (const record of list) {
    if (!record || typeof record !== "object") continue;
    const name = record.name;
    if (typeof name !== "string" || name.length === 0) continue;

    const meta = manifest.get(name);
    const valueSize =
      record.metadata && typeof record.metadata.value_size === "number"
        ? record.metadata.value_size
        : null;
    const lastModified =
      record.metadata && typeof record.metadata.last_modified === "string"
        ? record.metadata.last_modified
        : null;

    result.push({
      name,
      valueSize,
      lastModified,
      isSecret: meta?.secret === true,
      manifestType: meta?.type ?? null,
    });
  }
  return result;
}

/**
 * Parse the manifest emitted by `hoox config kv manifest --json` and
 * return a `Map` keyed by key name. Returns an empty map on any failure
 * — the view still functions, it just cannot flag secret keys.
 */
function parseKvManifest(
  stdout: string
): Map<string, { type: "boolean" | "number" | "string"; secret: boolean }> {
  const map = new Map<
    string,
    { type: "boolean" | "number" | "string"; secret: boolean }
  >();
  const cleaned = stdout.trim();
  if (!cleaned) return map;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return map;
  }

  // Manifest shape: { namespace: "CONFIG_KV", keys: [{ key, type, default, ... }] }
  const keys =
    parsed !== null &&
    typeof parsed === "object" &&
    "keys" in parsed &&
    Array.isArray((parsed as { keys: unknown }).keys)
      ? ((parsed as { keys: unknown }).keys as KvManifestRecord[])
      : [];

  for (const record of keys) {
    if (!record || typeof record !== "object") continue;
    const name = record.key;
    if (typeof name !== "string" || name.length === 0) continue;
    const type =
      record.type === "boolean" ||
      record.type === "number" ||
      record.type === "string"
        ? record.type
        : "string";
    map.set(name, { type, secret: record.secret === true });
  }
  return map;
}

/** ANSI escape sequence pattern for stripping terminal color codes */
// eslint-disable-next-line no-control-regex -- intentional: matches ESC (\x1b) sequences
const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Remove ANSI color escape codes from a string. */
function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "");
}

/**
 * Subset of the wrangler `queues list --json` record shape we care about.
 * We treat every field as optional so we degrade gracefully when fields
 * are missing or wrangler changes its schema.
 */
interface WranglerQueueRecord {
  queue_name?: string;
  queue_id?: string;
  producers_total_count?: number;
  consumers_total_count?: number;
  settings?: {
    delivery_paused?: boolean;
    message_retention_period?: number;
  };
}

/**
 * Convert `hoox monitor kill-switch <action>` output into a structured
 * {@link KillSwitchStatus}. The CLI's `show` subcommand emits a colored
 * human-readable string even in --json mode (its implementation only
 * switches the format for set actions), so we detect the engaged/released
 * state from the message text.
 */
function parseKillSwitchStatus(
  action: KillSwitchAction,
  stdout: string
): KillSwitchStatus {
  const timestamp = new Date().toISOString();
  const cleaned = stripAnsi(stdout).trim();
  const lowered = cleaned.toLowerCase();

  if (action === "engage") {
    return { engaged: true, rawValue: "true", timestamp, action };
  }
  if (action === "release") {
    return { engaged: false, rawValue: "false", timestamp, action };
  }

  // 'show' — derive state from the human-readable status line
  if (lowered.includes("kill switch is on") || lowered.includes("halted")) {
    return { engaged: true, rawValue: "true", timestamp, action };
  }
  if (
    lowered.includes("kill switch is off") ||
    (lowered.includes("active") && !lowered.includes("halted"))
  ) {
    return { engaged: false, rawValue: "false", timestamp, action };
  }

  // Fallback — look for an explicit "value: <v>" or "(not set)" marker
  const valueMatch = cleaned.match(/value:\s*(\S+)/i);
  if (valueMatch) {
    const raw = valueMatch[1] ?? null;
    return {
      engaged: raw === "true",
      rawValue: raw,
      timestamp,
      action,
    };
  }

  // Unknown output — treat as released (fail-open for display, but flag raw)
  return { engaged: false, rawValue: null, timestamp, action };
}

class CliBridgeImpl {
  private binaryPath: string | null = null;
  /** Maps tag → set of AbortControllers for concurrent commands with same tag */
  private activeCommands = new Map<string, Set<AbortController>>();
  /**
   * Global error sinks invoked on every CLI bridge failure. Listeners
   * receive a fully-formed `CliErrorDetails` payload so callers don't
   * need to translate `CliResult.errorType` themselves. The status bar
   * registers one sink at app startup to surface the real diagnostic
   * context (command, exit code, stderr) regardless of which view
   * triggered the command.
   */
  private errorSinks = new Set<(details: CliErrorDetails) => void>();

  async resolveBinary(): Promise<string> {
    if (this.binaryPath) return this.binaryPath;

    // Prefer explicit env, then PATH (`hx` is the short alias; `hoox` may be
    // a shell alias that Bun.which still resolves via ~/.bun/bin).
    const envBin = process.env.HOOX_CLI?.trim();
    if (envBin) {
      this.binaryPath = envBin;
      return envBin;
    }

    for (const name of ["hx", "hoox"] as const) {
      const fromPath = Bun.which(name);
      if (fromPath) {
        this.binaryPath = fromPath;
        return fromPath;
      }
    }

    const root = await this.findMonorepoRoot();

    const nodeBin = path.join(root, "node_modules", ".bin", "hoox");
    if (await Bun.file(nodeBin).exists()) {
      this.binaryPath = nodeBin;
      return nodeBin;
    }

    const cliBin = path.join(root, "packages", "cli", "bin", "hoox.js");
    if (await Bun.file(cliBin).exists()) {
      this.binaryPath = cliBin;
      return cliBin;
    }

    throw new Error(
      "hoox binary not found — install the CLI (`bun install -g ./packages/cli`) or set HOOX_CLI"
    );
  }

  /** Track a new command under a tag. Returns a cleanup function. */
  private trackCommand(tag: string, aborter: AbortController): () => void {
    const controllers = this.activeCommands.get(tag) ?? new Set();
    controllers.add(aborter);
    this.activeCommands.set(tag, controllers);
    return () => {
      const set = this.activeCommands.get(tag);
      if (set) {
        set.delete(aborter);
        if (set.size === 0) this.activeCommands.delete(tag);
      }
    };
  }

  invalidateCache(): void {
    this.binaryPath = null;
  }

  /**
   * Register a global error sink. The sink is invoked **synchronously**
   * after every `exec()` call that produced a non-null `errorType`, with
   * a fully-formed `CliErrorDetails` payload (command, exit code, stderr,
   * stdout, classification, duration, timestamp).
   *
   * Returns an unsubscribe function. Safe to call from React `useEffect`
   * — typical pattern is to register on mount, unsubscribe on unmount.
   *
   * Sinks must not throw; exceptions are caught and logged so a buggy
   * listener can never break the bridge.
   */
  onError(sink: (details: CliErrorDetails) => void): () => void {
    this.errorSinks.add(sink);
    return () => {
      this.errorSinks.delete(sink);
    };
  }

  /**
   * Build a `CliErrorDetails` snapshot from a finished `CliResult` and
   * fan it out to every registered sink. No-op on success.
   *
   * `timestamp` is captured at the moment the command finished (not at
   * registration time) so multiple commands get distinct timestamps.
   */
  private notifyError(result: CliResult<unknown>): void {
    if (result.errorType === null) return;
    const details: CliErrorDetails = {
      command: result.command,
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      errorType: result.errorType,
      timestamp: Date.now(),
      duration: result.duration,
    };
    for (const sink of this.errorSinks) {
      try {
        sink(details);
      } catch (err) {
        // Defensive: a buggy sink must never break the bridge.

        console.error("[cli-bridge] error sink threw:", err);
      }
    }
  }

  /**
   * Locate the hoox-setup monorepo (local checkout or $HOME/.hoox/repo).
   * Prefers resolveHooxRuntimeRoot so the TUI works outside the checkout.
   */
  private async findMonorepoRoot(): Promise<string> {
    const runtime = resolveHooxRuntimeRoot();
    if (runtime.root) return runtime.root;

    // Fallback: walk-up for any package.json with workspaces
    let dir = process.cwd();
    while (true) {
      try {
        const pkgPath = path.join(dir, "package.json");
        const pkg = JSON.parse(await Bun.file(pkgPath).text()) as {
          workspaces?: string[];
        };
        if (pkg.workspaces) return dir;
      } catch {
        /* not found or invalid JSON */
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        // Last resort: global managed clone path even if markers incomplete
        const globalRepo = getHooxRepoPath();
        if (await Bun.file(path.join(globalRepo, "package.json")).exists()) {
          return globalRepo;
        }
        throw new Error(
          "Monorepo root not found — run `hoox doctor --fix-runtime` or set HOOX_REPO"
        );
      }
      dir = parent;
    }
  }

  /**
   * Truncate long captured output to a safe cap, preserving the tail
   * (where most CLI errors appear) and adding a marker.
   */
  private truncateOutput(text: string): string {
    if (text.length <= MAX_OUTPUT_CHARS) return text;
    const tail = text.slice(text.length - MAX_OUTPUT_CHARS + 64);
    return `…[${text.length - tail.length} chars truncated]…\n${tail}`;
  }

  /**
   * Public entry point. Wraps {@link execCore} with error-sink
   * notification so every caller — convenience methods and direct
   * invocations alike — propagates failures to registered listeners
   * without each caller having to do the bookkeeping.
   */
  async exec<T>(args: string[], options?: ExecOptions): Promise<CliResult<T>> {
    const result = await this.execCore<T>(args, options);
    this.notifyError(result);
    void tuiDevLog.debug(
      "cli-bridge",
      result.success ? "exec ok" : "exec fail",
      {
        tag: options?.tag ?? args[0] ?? "unknown",
        args,
        success: result.success,
        exitCode: result.exitCode,
        durationMs: Math.round(result.duration),
        errorType: result.errorType ?? null,
        stderr: result.success ? undefined : result.stderr || undefined,
      }
    );
    return result;
  }

  /**
   * Internal exec implementation. Always returns a fully-populated
   * `CliResult` — never throws. All failure modes (spawn, abort,
   * timeout, non-zero exit, JSON parse) are classified into
   * `errorType` so the wrapper can fan out to listeners.
   */
  private async execCore<T>(
    args: string[],
    options?: ExecOptions
  ): Promise<CliResult<T>> {
    const start = performance.now();
    const tag = options?.tag ?? args[0] ?? "unknown";
    const aborter = new AbortController();
    const cleanup = this.trackCommand(tag, aborter);

    const cmdArgs = [...args];
    if (options?.json) cmdArgs.push("--json");
    if (options?.yes) cmdArgs.push("--yes");

    // Stable command label for the "binary not found" path where the
    // resolved binary path is unknown.
    const baseCommand = `hoox ${args.join(" ")}`;

    try {
      const binary = await this.resolveBinary();
      const command = `${binary} ${cmdArgs.join(" ")}`;
      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn([binary, ...cmdArgs], {
          stdout: "pipe",
          stderr: "pipe",
          signal: aborter.signal,
        });
      } catch (spawnErr) {
        // Bun.spawn itself failed (EACCES, ENOENT, etc.) — classify it.
        cleanup();
        const stderr = (spawnErr as Error).message;
        return {
          success: false,
          exitCode: -1,
          stdout: "",
          stderr,
          data: null,
          duration: performance.now() - start,
          command,
          errorType: "spawn-error",
        };
      }

      const timeoutMs = options?.timeout ?? 30_000;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        aborter.abort();
      }, timeoutMs);

      let stderrResult = "";
      const readStderr = async () => {
        const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            stderrResult += chunk;
            options?.onProgress?.(chunk);
          }
        } catch (streamErr) {
          // Stream closing due to abort is expected
          if (!aborter.signal.aborted) throw streamErr;
        }
      };

      const [stdout] = await Promise.all([
        new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
        readStderr(),
      ]);

      const exitCode = await proc.exited;
      clearTimeout(timer);
      cleanup();

      // Streams are already fully consumed above (via getReader/Response),
      // so they're naturally closed. Cancel is not needed here — the
      // readers already hold the locks and .cancel() on a locked stream
      // throws TypeError: "Invalid state: ReadableStream is locked".

      let data: T | null = null;
      if (options?.json && exitCode === 0 && stdout.trim()) {
        try {
          data = JSON.parse(stdout) as T;
        } catch {
          /* non-JSON output even with --json flag */
        }
      }

      // Classify the failure (success leaves errorType=null).
      const errorType: CliErrorType | null =
        exitCode === 0
          ? null
          : timedOut
            ? "timeout"
            : aborter.signal.aborted
              ? "aborted"
              : "non-zero-exit";

      return {
        success: exitCode === 0,
        exitCode,
        stdout: this.truncateOutput(stdout),
        stderr: this.truncateOutput(stderrResult),
        data,
        duration: performance.now() - start,
        command,
        errorType,
      };
    } catch (err) {
      cleanup();
      const isAbort = err instanceof Error && err.name === "AbortError";
      // Distinguish "binary not found" from generic spawn-time errors so
      // the status bar can suggest `bun install` rather than a runtime fix.
      const errorType: CliErrorType = isAbort
        ? "aborted"
        : (err as Error).message.includes("not found")
          ? "binary-not-found"
          : "spawn-error";
      return {
        success: false,
        exitCode: -1,
        stdout: "",
        stderr: this.truncateOutput(
          isAbort ? "Command timed out or was aborted" : (err as Error).message
        ),
        data: null,
        duration: performance.now() - start,
        command: baseCommand,
        errorType,
      };
    }
  }

  abort(tag: string): void {
    const controllers = this.activeCommands.get(tag);
    if (controllers) {
      for (const aborter of controllers) aborter.abort();
      this.activeCommands.delete(tag);
    }
  }

  dispose(): void {
    for (const [, controllers] of this.activeCommands) {
      for (const aborter of controllers) aborter.abort();
    }
    this.activeCommands.clear();
  }

  deployAll(onProgress?: (chunk: string) => void): Promise<CliResult<unknown>> {
    return this.exec(["deploy", "all"], {
      json: true,
      yes: true,
      timeout: 120_000,
      onProgress,
      tag: "deploy:all",
    });
  }

  deployWorker(
    name: string,
    onProgress?: (chunk: string) => void
  ): Promise<CliResult<unknown>> {
    return this.exec(["deploy", "worker", name], {
      json: true,
      yes: true,
      timeout: 60_000,
      onProgress,
      tag: `deploy:${name}`,
    });
  }

  checkHealth(): Promise<CliResult<unknown>> {
    return this.exec(["check", "health"], {
      json: true,
      timeout: 15_000,
      tag: "check:health",
    });
  }

  /**
   * Run health check with auto-fix probe via `hoox check health --fix`.
   *
   * Returns health check results with fix recommendations. Unlike `checkFix`,
   * this does not apply any repairs — it only checks connectivity and suggests
   * running `hoox check fix` if issues were found.
   *
   * @returns A CliResult with `data` containing a `HealthCheckResult[]` when
   *          successful (same shape as `checkHealth`).
   */
  checkHealthFix(): Promise<CliResult<unknown>> {
    return this.exec(["check", "health", "--fix"], {
      json: true,
      timeout: 15_000,
      tag: "check:health:fix",
    });
  }

  /**
   * Run auto-repair via `hoox check fix` to apply non-destructive fixes.
   *
   * Performs common repairs:
   *   1. Creates missing .dev.vars placeholder files
   *   2. Adds missing nodejs_compat compatibility flags
   *   3. Adds missing name fields to wrangler.jsonc
   *
   * @returns A CliResult with `data` containing a `FixReport` with the
   *          fix action results (applied, failed, or skipped).
   */
  checkFix(): Promise<CliResult<unknown>> {
    return this.exec(["check", "fix"], {
      json: true,
      yes: true,
      timeout: 60_000,
      tag: "check:fix",
    });
  }

  workerLogs(name: string): Promise<CliResult<unknown>> {
    return this.exec(["logs", "worker", name, "--no-follow"], {
      json: true,
      timeout: 30_000,
      tag: `logs:${name}`,
    });
  }

  configShow(): Promise<CliResult<unknown>> {
    return this.exec(["config", "show"], {
      json: true,
      timeout: 10_000,
      tag: "config:show",
    });
  }

  configValidate(): Promise<CliResult<unknown>> {
    return this.exec(["config", "env", "validate"], {
      json: true,
      timeout: 10_000,
      tag: "config:validate",
    });
  }

  monitorStatus(): Promise<CliResult<unknown>> {
    return this.exec(["check", "health"], {
      json: true,
      timeout: 15_000,
      tag: "check:health",
    });
  }

  rebuild(onProgress?: (chunk: string) => void): Promise<CliResult<unknown>> {
    return this.exec(["repair", "rebuild"], {
      json: true,
      yes: true,
      timeout: 120_000,
      onProgress,
      tag: "repair:rebuild",
    });
  }

  repairWorker(
    name: string,
    onProgress?: (chunk: string) => void
  ): Promise<CliResult<unknown>> {
    return this.exec(["repair", "worker", name], {
      json: true,
      yes: true,
      timeout: 60_000,
      onProgress,
      tag: `repair:${name}`,
    });
  }

  checkSetup(): Promise<CliResult<unknown>> {
    return this.exec(["check", "setup"], {
      json: true,
      timeout: 20_000,
      tag: "check:setup",
    });
  }

  /**
   * Control the global trade kill switch via `hoox monitor kill-switch <action>`.
   *
   * Accepts semantic action names ("show" | "engage" | "release") — these are
   * translated internally to the CLI's "on"/"off" verbs.
   *
   * @param action - "show" reads current state, "engage" halts trading,
   *                 "release" resumes trading.
   * @returns A CliResult with `data` containing a structured {engaged, rawValue, timestamp}
   *          payload. The CLI's `show` subcommand emits a colored human-readable string
   *          even in --json mode, so we parse stdout to derive `engaged`.
   */
  monitorKillSwitch(
    action: KillSwitchAction
  ): Promise<CliResult<KillSwitchStatus>> {
    // Map semantic action → CLI verb
    const cliAction =
      action === "engage" ? "on" : action === "release" ? "off" : "show";

    return this.exec(["monitor", "kill-switch", cliAction], {
      json: true,
      yes: true,
      timeout: 15_000,
      tag: `monitor:kill-switch:${action}`,
    }).then((result) => {
      if (!result.success) {
        return { ...result, data: null };
      }
      return {
        ...result,
        data: parseKillSwitchStatus(action, result.stdout),
      };
    });
  }

  /**
   * Read Cloudflare Queue backlog pressure via `hoox monitor queue-depth`.
   *
   * The CLI runs `wrangler queues list --json` and re-emits a normalized
   * `{ queues: [...] }` envelope. We parse that envelope into a fully-typed
   * {@link QueueDepth} array so the view can render directly without
   * knowing the wrangler/CLI plumbing.
   *
   * Note: `wrangler queues list` does not expose real-time message counts.
   * `depth` is a heuristic estimate derived from the producer count (each
   * producer is assumed to enqueue ~100 messages on average). See the
   * {@link QueueDepth} doc for the full status model.
   *
   * @returns A CliResult with `data` containing the array of queues. The
   *          data is `null` on failure (e.g., wrangler not installed or
   *          not authenticated). On success with zero queues, `data` is
   *          an empty array — not `null`.
   */
  monitorQueueDepth(): Promise<CliResult<QueueDepth[]>> {
    return this.exec(["monitor", "queue-depth"], {
      json: true,
      timeout: 20_000,
      tag: "monitor:queue-depth",
    }).then((result) => {
      if (!result.success) {
        return { ...result, data: null };
      }
      return {
        ...result,
        data: parseQueueDepths(result.stdout),
      };
    });
  }

  /**
   * Execute a read-only D1 SQL query via `hoox db query <sql>`.
   *
   * The CLI runs `wrangler d1 execute <db> --command <sql> --json` and
   * passes the envelope through. We:
   *   1. Run {@link validateReadOnlySql} on the SQL *first* — if the
   *      caller passed a non-SELECT, the bridge returns a structured
   *      "non-zero-exit" CliResult with the validation reason in stderr
   *      and never spawns the CLI. This is the TUI's read-only guarantee.
   *   2. On CLI success, parse the wrangler envelope into a normalized
   *      {@link DbQueryResult} (columns, rows, execution time).
   *
   * The validation step is intentionally duplicated on the client (the
   * CLI also has its own; see `hoox db query --help`). Defence in depth.
   *
   * @param sql - The SQL string. Must be a read-only statement.
   * @returns A CliResult with `data` containing a {@link DbQueryResult} on
   *          success, or `null` on any failure (validation, spawn, or
   *          wrangler error). The bridge never throws.
   */
  dbQuery(sql: string): Promise<CliResult<DbQueryResult>> {
    const trimmed = (sql ?? "").trim();
    const validation = validateReadOnlySql(trimmed);
    if (!validation.readonly) {
      // Refuse to spawn the CLI; return a synthetic non-zero-exit result
      // with the validation reason in stderr. The view's existing error
      // rendering surfaces this without any special-casing.
      const reason = (validation as { reason: string }).reason;
      return Promise.resolve({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: `Read-only validation failed: ${reason}`,
        data: null,
        duration: 0,
        command: `hoox db query ${JSON.stringify(trimmed)}`,
        errorType: "non-zero-exit",
      });
    }

    return this.exec(["db", "query", trimmed], {
      json: true,
      timeout: 30_000,
      tag: "db:query",
    }).then((result) => {
      if (!result.success) {
        return { ...result, data: null };
      }
      return {
        ...result,
        data: parseDbQueryResult(result.stdout),
      };
    });
  }

  /**
   * Read the Cloudflare CONFIG_KV namespace via `hoox config kv list` and
   * merge the result with the manifest (`hoox config kv manifest`) so
   * secret keys can be flagged in the UI.
   *
   * The bridge fires both commands in parallel — they are independent
   * reads and the view can render the key list as soon as it arrives
   * (manifest data enriches the rendered rows but is not required).
   *
   * Security note: this method returns *names* and metadata only. To
   * fetch an individual value the caller should use
   * {@link CliBridgeImpl.configKvGet}. The KV *viewer* is read-only;
   * worker-settings may write non-secret keys via
   * {@link CliBridgeImpl.configKvSet}. Secrets remain CLI-only.
   *
   * @returns A CliResult with `data` containing a {@link KvKeySnapshot}.
   *          `data` is `null` on failure (CLI binary not found, wrangler
   *          not installed, etc.). On success with zero keys, `data.keys`
   *          is an empty array.
   */
  configKvList(): Promise<CliResult<KvKeySnapshot>> {
    return Promise.all([
      this.exec(["config", "kv", "list"], {
        json: true,
        timeout: 20_000,
        tag: "config:kv:list",
      }),
      this.exec(["config", "kv", "manifest"], {
        json: true,
        timeout: 20_000,
        tag: "config:kv:manifest",
      }),
    ]).then(([listResult, manifestResult]) => {
      // If the primary list command failed, surface its error verbatim —
      // the manifest failure is secondary and the view can still render
      // an empty manifest cross-reference.
      if (!listResult.success) {
        return {
          ...listResult,
          data: null,
        };
      }
      const manifest = manifestResult.success
        ? parseKvManifest(manifestResult.stdout)
        : new Map<
            string,
            { type: "boolean" | "number" | "string"; secret: boolean }
          >();
      const keys = parseKvList(listResult.stdout, manifest);
      // Extract namespace ID from the manifest envelope when available,
      // otherwise leave it null. The view only needs it for display.
      const nsId = extractNamespaceId(manifestResult.stdout);
      const snapshot: KvKeySnapshot = {
        keys,
        timestamp: new Date().toISOString(),
        namespaceId: nsId,
      };
      return {
        ...listResult,
        data: snapshot,
      };
    });
  }

  /**
   * Fetch the value of a single KV key via `hoox config kv get <key>`.
   *
   * This is a separate method (not bundled into `configKvList`) so the
   * viewer / worker-settings can lazy-load individual values. Writes for
   * non-secret settings go through {@link CliBridgeImpl.configKvSet}
   * (worker-settings view only).
   *
   * @param key - The KV key name to look up.
   * @returns A CliResult with `data` containing the string value
   *          (`null` when the key is missing, empty string, or when the
   *          command failed).
   */
  configKvGet(key: string): Promise<CliResult<string | null>> {
    return this.exec(["config", "kv", "get", key], {
      json: true,
      timeout: 15_000,
      tag: `config:kv:get:${key}`,
    }).then((result) => {
      if (!result.success) {
        // Missing key is not a hard error — the CLI exits non-zero with
        // a "not found" message and the viewer should display an empty
        // value rather than an error pill.
        const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
        if (combined.includes("not found")) {
          return { ...result, data: null, success: true };
        }
        return { ...result, data: null };
      }
      const cleaned = result.stdout.replace(/\n$/, "").trim();
      return {
        ...result,
        data: cleaned.length > 0 ? cleaned : null,
      };
    });
  }

  /**
   * Write a CONFIG_KV key via `hoox config kv set <key> <value>`.
   * Used by the worker-settings view (dashboard.jsonc fields).
   * Prefer for non-secret settings only — secrets stay CLI-only.
   */
  configKvSet(key: string, value: string): Promise<CliResult<null>> {
    return this.exec(["config", "kv", "set", key, value], {
      json: false,
      timeout: 20_000,
      tag: `config:kv:set:${key}`,
    }).then((result) => ({
      ...result,
      data: null,
    }));
  }

  /**
   * Read the list of secrets declared in wrangler.jsonc via
   * `hoox config secrets list --json`.
   *
   * Security: this method returns *names* and *inferred types* only.
   * No secret values are ever fetched or displayed — the viewer is
   * strictly read-only and values are not available via the CLI in
   * any case (`hoox config secrets list` only returns names).
   *
   * @returns A CliResult with `data` containing a {@link SecretsSnapshot}.
   *          `data` is `null` on failure (CLI binary not found, wrangler
   *          not installed, etc.). On success with zero secrets, `data.secrets`
   *          is an empty array.
   */
  configSecretsList(): Promise<CliResult<SecretsSnapshot>> {
    return this.exec(["config", "secrets", "list"], {
      json: true,
      timeout: 20_000,
      tag: "config:secrets:list",
    }).then((result) => {
      if (!result.success) {
        return { ...result, data: null };
      }
      const secrets = parseSecretsList(result.stdout);
      const snapshot: SecretsSnapshot = {
        secrets,
        timestamp: new Date().toISOString(),
      };
      return { ...result, data: snapshot };
    });
  }

  /**
   * Check the health of all AI model providers via `hoox agent health --json`.
   *
   * The CLI command queries configured AI providers (Workers AI, OpenAI,
   * Anthropic, Google, Azure) and returns their operational status, latency,
   * and usage metrics. This is used by the TUI dashboard to display a
   * real-time health overview of all AI integrations.
   *
   * @returns A CliResult with `data` containing an {@link AgentHealthResult}
   *          on success, or `null` on failure. On success with zero providers,
   *          `data.providers` is an empty array — not `null`.
   */
  agentHealthCheck(): Promise<CliResult<AgentHealthResult>> {
    return this.exec(["agent", "health"], {
      json: true,
      timeout: 30_000,
      tag: "agent:health",
    }).then((result) => {
      if (!result.success) {
        return { ...result, data: null };
      }
      return {
        ...result,
        data: parseAgentHealth(result.stdout),
      };
    });
  }

  /**
   * Probe pyne-worker via `hoox pyne health --json`.
   *
   * Used by the TUI dashboard to show PYNE edge evaluate availability
   * without requiring a separate view.
   */
  pyneHealthCheck(): Promise<CliResult<PyneHealthResult>> {
    return this.exec(["pyne", "health"], {
      json: true,
      timeout: 15_000,
      tag: "pyne:health",
    }).then((result) => {
      if (!result.success) {
        return {
          ...result,
          data: {
            worker: "pyne-worker",
            url: "",
            status: "down" as const,
            error: result.stderr || result.stdout || "probe failed",
            timestamp: new Date().toISOString(),
          },
        };
      }
      return {
        ...result,
        data: parsePyneHealth(result.stdout),
      };
    });
  }
}

/**
 * Parse the JSON output from `hoox agent health --json` into a structured
 * {@link AgentHealthResult}. Unknown provider shapes are skipped; the
 * function never throws on malformed input — it returns an empty providers
 * array instead.
 *
 * Expected envelope shape:
 *   { "providers": [ { "name": "...", "model": "...", "status": "online",
 *                      "latencyMs": 45, "dailyRequests": 1234 } ] }
 */
/**
 * Parse `hoox pyne health --json` stdout into {@link PyneHealthResult}.
 */
function parsePyneHealth(stdout: string): PyneHealthResult {
  const timestamp = new Date().toISOString();
  const cleaned = stdout.trim();
  if (!cleaned) {
    return {
      worker: "pyne-worker",
      url: "",
      status: "down",
      error: "empty response",
      timestamp,
    };
  }
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const statusRaw = parsed.status;
    const status: PyneHealthResult["status"] =
      statusRaw === "healthy" ||
      statusRaw === "degraded" ||
      statusRaw === "down"
        ? statusRaw
        : "down";
    return {
      worker: typeof parsed.worker === "string" ? parsed.worker : "pyne-worker",
      url: typeof parsed.url === "string" ? parsed.url : "",
      status,
      httpStatus:
        typeof parsed.httpStatus === "number" ? parsed.httpStatus : undefined,
      latencyMs:
        typeof parsed.latencyMs === "number" ? parsed.latencyMs : undefined,
      body: parsed.body,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      timestamp,
    };
  } catch {
    return {
      worker: "pyne-worker",
      url: "",
      status: "down",
      error: "invalid JSON from hoox pyne health",
      timestamp,
    };
  }
}

function parseAgentHealth(stdout: string): AgentHealthResult {
  const timestamp = new Date().toISOString();
  const cleaned = stdout.trim();
  if (!cleaned) {
    return { providers: [], timestamp };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { providers: [], timestamp };
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("providers" in parsed) ||
    !Array.isArray((parsed as { providers: unknown }).providers)
  ) {
    return { providers: [], timestamp };
  }

  const records = (parsed as { providers: unknown }).providers;
  const result: ModelHealth[] = [];

  for (const record of records as unknown[]) {
    if (!record || typeof record !== "object") continue;

    const r = record as Record<string, unknown>;
    const name =
      typeof r.name === "string" && r.name.length > 0 ? r.name : null;
    if (!name) continue;

    const model = typeof r.model === "string" ? r.model : "unknown";
    const statusRaw = r.status;
    const status: ModelHealth["status"] =
      statusRaw === "online" ||
      statusRaw === "degraded" ||
      statusRaw === "offline"
        ? statusRaw
        : "offline";
    const latencyMs =
      typeof r.latencyMs === "number" && r.latencyMs >= 0 ? r.latencyMs : null;
    const dailyRequests =
      typeof r.dailyRequests === "number" && r.dailyRequests >= 0
        ? r.dailyRequests
        : null;
    const error = typeof r.error === "string" ? r.error : undefined;

    result.push({ name, model, status, latencyMs, dailyRequests, error });
  }

  return { providers: result, timestamp };
}

/**
 * Extract the namespace ID from a `hoox config kv manifest --json` envelope
 * if it carries one. Currently the CLI's manifest envelope does not
 * include the ID, so this returns `null` for the time being. The helper
 * exists so future manifest changes can light up the namespace column
 * without touching the viewer.
 */
function extractNamespaceId(_manifestStdout: string): string | null {
  // Reserved for future CLI versions — manifest envelope does not yet
  // surface the namespace ID. Kept as a separate function to keep the
  // test surface stable.
  return null;
}

export const cliBridge = new CliBridgeImpl();

// ─── Re-exports for backward compatibility ─────────────────────────────────────

export {
  validateReadOnlySql,
  agentChatStream,
  AI_MODEL_OPTIONS,
} from "./standalone";
export type {
  ExecOptions,
  KillSwitchAction,
  KillSwitchStatus,
  QueueDepthStatus,
  QueueDepth,
  DbQueryResult,
  SqlValidationResult,
  SecretMetadata,
  SecretsSnapshot,
  KvKey,
  KvKeySnapshot,
  ModelHealth,
  AgentHealthResult,
  PyneHealthResult,
  ChatMessage,
  AiModelOption,
  AgentChatStreamResult,
} from "./types";
