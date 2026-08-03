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

export interface ExecOptions {
  json?: boolean;
  yes?: boolean;
  timeout?: number;
  onProgress?: (chunk: string) => void;
  tag?: string;
}

/**
 * Semantic action name for the kill-switch bridge. The UI speaks engage/release
 * (user-facing verbs), the CLI speaks on/off. We accept the semantic name
 * here and translate internally.
 */
export type KillSwitchAction = "show" | "engage" | "release";

/**
 * Normalized status of the global trade kill switch.
 *
 * Returned by {@link CliBridgeImpl.monitorKillSwitch} so views don't need to
 * parse the CLI's colored output themselves.
 */
export interface KillSwitchStatus {
  /** True when trading is halted (KV value === "true") */
  engaged: boolean;
  /** Raw KV value as returned by the CLI ("true" | "false" | null when unset) */
  rawValue: string | null;
  /** ISO-8601 timestamp captured client-side when the status was read */
  timestamp: string;
  /** The action that produced this status (helpful for UI feedback) */
  action: KillSwitchAction;
}

/**
 * Backlog pressure for a single Cloudflare Queue.
 *
 * Returned by {@link CliBridgeImpl.monitorQueueDepth} — the shape is fully
 * normalized on the bridge side so views can render directly without
 * needing to parse wrangler's JSON or the CLI's stdout.
 *
 * The `depth` field is a *heuristic estimate* derived from
 * `producers_total_count` (each producer is assumed to enqueue ~100 msgs
 * on average) because Cloudflare Queues does not expose real-time backlog
 * counts via `wrangler queues list`. The view's color coding
 * (green/yellow/red) operates on this estimate.
 *
 * Threshold conventions (used by the view's color coding):
 *   - depth < 100             → "healthy"
 *   - 100 <= depth <= 500     → "backlogged"
 *   - depth > 500             → "critical"
 *   - delivery_paused = true  → "paused" (overrides depth thresholds)
 *   - no data                 → "unknown"
 */
export type QueueDepthStatus =
  | "healthy"
  | "backlogged"
  | "critical"
  | "paused"
  | "unknown";

/** Per-queue depth info. See {@link QueueDepthStatus} for status semantics. */
export interface QueueDepth {
  queueName: string;
  depth: number;
  max: number;
  status: QueueDepthStatus;
  /** Cloudflare producer count (informational, view can render) */
  producers: number;
  /** Cloudflare consumer count (informational, view can render) */
  consumers: number;
  /** True when delivery is paused on this queue */
  paused: boolean;
  /** ISO-8601 timestamp when the depth was sampled */
  timestamp: string;
}

/**
 * Normalized result of a read-only D1 SQL query executed through
 * {@link CliBridgeImpl.dbQuery}.
 *
 * Mirrors the wrangler `d1 execute --json` envelope shape but collapses it
 * to what the TUI view actually needs:
 *
 *   wrangler:
 *     [ { results: [{...}, {...}], success: true,
 *         meta: { duration: 0.123, rows_read: 42, ... } } ]
 *
 *   → DbQueryResult:
 *     { columns: [...], rows: [...], rowCount, executionTimeMs, meta }
 */
export interface DbQueryResult {
  /** Column names in display order (derived from the first row). */
  columns: string[];
  /** Row data, one record per result. */
  rows: Record<string, unknown>[];
  /** Convenience: `rows.length`. */
  rowCount: number;
  /** Wall-clock SQL execution time in milliseconds (from wrangler's `meta.duration`),
   *  or `null` if wrangler did not report it. */
  executionTimeMs: number | null;
  /** Raw wrangler `meta` block for callers that want additional fields
   *  (rows_read, changed_db, etc.). Null when the CLI did not return a meta block. */
  meta: Record<string, unknown> | null;
}

/**
 * Outcome of a client-side SQL safety check.
 *
 * Returned by {@link validateReadOnlySql} so the view can surface a
 * specific, actionable error message without ever round-tripping the
 * command to the local `hoox` binary.
 */
export type SqlValidationResult =
  | { readonly: true }
  | { readonly: false; reason: string };

/**
 * A single Cloudflare Workers secret metadata (read-only, no values exposed).
 *
 * Returned by {@link CliBridgeImpl.configSecretsList}. Values are intentionally
 * omitted — the TUI viewer is strictly read-only and the CLI equivalent
 * (`hoox config secrets list`) only surfaces names/types anyway.
 */
export interface SecretMetadata {
  /** Secret name / key, e.g. "BINANCE_KEY_BINDING" or "OPENAI_API_KEY". */
  name: string;
  /**
   * Inferred type based on naming conventions. Cloudflare secrets store
   * does not expose per-secret type metadata, so we derive it from the
   * key name suffix.
   */
  type: "api_key" | "secret" | "token" | "password" | "unknown";
  /**
   * Source of the secret declaration: either "Cloudflare" (via wrangler secret)
   * or "config" (declared in wrangler.jsonc but not yet synced).
   */
  source: "Cloudflare" | "config";
}

/**
 * A read-only snapshot of all secrets across workers. Returned by
 * {@link CliBridgeImpl.configSecretsList}.
 */
export interface SecretsSnapshot {
  secrets: SecretMetadata[];
  /**
   * ISO-8601 timestamp captured client-side when the snapshot was read.
   * Surfaces a "Last sampled" footer in the view.
   */
  timestamp: string;
}

/**
 * A single Cloudflare KV key as exposed by `hoox config kv list --json`.
 *
 * The view treats `valueSize` and `lastModified` as best-effort metadata:
 * the canonical CLI output only includes `name` and the human-readable
 * flag. Future CLI versions may surface richer metadata; the view renders
 * a dash in those columns when the data is missing so the table stays
 * aligned.
 *
 * Security note: `isSecret` is *advisory* — it is derived by cross-
 * referencing the key name against the known KV manifest. Users should
 * still treat any KV value as potentially sensitive.
 */
export interface KvKey {
  /** Full key name, e.g. `"trade:kill_switch"` or `"agent:openai_key"`. */
  name: string;
  /** Byte size of the stored value. `null` if unknown. */
  valueSize: number | null;
  /**
   * ISO-8601 timestamp of the last write. `null` if the CLI did not
   * surface it (current `hoox config kv list` does not include it).
   */
  lastModified: string | null;
  /**
   * True if the key is known to be secret per the KV manifest. Manifest
   * keys with `secret: true` (API keys, watermarks, etc.) are flagged
   * here so the view can render a warning before showing the value.
   */
  isSecret: boolean;
  /**
   * Manifest-declared type for this key, when known. One of
   * `"boolean" | "number" | "string" | null`. Useful for rendering a
   * type tag in the table.
   */
  manifestType: "boolean" | "number" | "string" | null;
}

/**
 * A read-only snapshot of all KV keys plus the manifest cross-reference
 * used to flag secret keys. Returned by {@link CliBridgeImpl.configKvList}.
 */
export interface KvKeySnapshot {
  keys: KvKey[];
  /**
   * ISO-8601 timestamp captured client-side when the snapshot was read.
   * Surfaces a "Last sampled" footer in the view.
   */
  timestamp: string;
  /**
   * The KV namespace ID that was used to fetch the keys. `null` when the
   * CLI auto-detection failed (e.g. wrangler not installed).
   */
  namespaceId: string | null;
}

/**
 * Health status for a single AI model provider.
 */
export interface ModelHealth {
  /** Provider name, e.g. "Workers AI", "OpenAI", "Anthropic", "Google", "Azure" */
  name: string;
  /** Provider-specific model identifier, e.g. "@cf/meta/llama-3.1-8b-instruct" */
  model: string;
  /** Operational state */
  status: "online" | "degraded" | "offline";
  /** Latency in milliseconds (null when unknown or offline) */
  latencyMs: number | null;
  /** Daily request count (null when unavailable) */
  dailyRequests: number | null;
  /** Error message when status is not "online" */
  error?: string;
}

/**
 * Result of an AI model health check covering all configured providers.
 */
export interface AgentHealthResult {
  providers: ModelHealth[];
  /** ISO-8601 timestamp when the check was performed */
  timestamp: string;
}

/** Local AI chat message shape. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/** Available AI providers/models for the chat interface. */
export interface AiModelOption {
  id: string;
  label: string;
  provider: string;
}

/**
 * SSE streaming subscription for AI chat responses.
 *
 * Connects to the hoox-setup API's /api/agent/chat endpoint and invokes
 * the onToken callback for each streamed token fragment. Supports
 * reconnection with exponential backoff on connection loss.
 *
 * Returns an AbortController whose `.signal.aborted` flag can be set
 * to terminate the stream; callers should check this flag to avoid
 * processing tokens after abort.
 */
export interface AgentChatStreamResult {
  /** AbortController for cancelling the stream. */
  abort: AbortController;
  /** Promise that resolves when the stream finishes or fails. */
  finished: Promise<void>;
}
