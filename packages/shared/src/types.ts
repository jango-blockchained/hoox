import { z } from "zod";

// --- Zod Schemas (runtime-validated) ---

export const TradeActionSchema = z.enum([
  "LONG",
  "SHORT",
  "CLOSE_LONG",
  "CLOSE_SHORT",
]);

export const WebhookPayloadSchema = z
  .object({
    exchange: z.string().min(1),
    action: TradeActionSchema,
    symbol: z.string().min(1).max(20),
    quantity: z.number().positive().finite(),
    price: z.number().positive().finite().optional(),
    orderType: z.string().optional(),
    leverage: z.number().int().positive().optional(),
  })
  .strict();

/** Validated trade queue payload (hoox producer → trade-worker consumer). */
export const TradeQueueMessageSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    exchange: z.string().min(1).max(64),
    action: TradeActionSchema,
    symbol: z.string().min(1).max(32),
    quantity: z.number().positive().finite(),
    price: z.number().positive().finite().optional(),
    leverage: z.number().int().positive().max(125).optional(),
    queuedAt: z.string().min(1).max(64),
  })
  .strict();

export const TradeSignalSchema = z
  .object({
    id: z.number().int().positive().optional(),
    source: z.string().min(1),
    symbol: z.string().min(1),
    action: TradeActionSchema,
    price: z.number().positive().finite().optional(),
    quantity: z.number().positive().finite(),
    leverage: z.number().int().positive().optional(),
    status: z.enum(["pending", "executed", "failed", "skipped"]).optional(),
    createdAt: z.string().optional(),
    executedAt: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();

export const PositionSchema = z
  .object({
    id: z.string(),
    symbol: z.string().min(1),
    side: TradeActionSchema,
    quantity: z.number().positive(),
    entry_price: z.number().positive(),
    current_price: z.number().positive(),
    unrealized_pnl: z.number(),
    timestamp: z.number().int().positive(),
  })
  .strict();

export const BalanceSchema = z
  .object({
    asset: z.string().min(1),
    free: z.number().min(0),
    locked: z.number().min(0),
    timestamp: z.number().int().positive(),
  })
  .strict();

// --- Existing types (backward compatible) ---

export interface StandardResponse {
  success: boolean;
  result?: unknown;
  error?: string | null;
  message?: string;
  tradeResult?: unknown;
  notificationResult?: unknown;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface WorkerServiceBinding {
  binding: string;
  service: string;
}

export interface WorkerD1Binding {
  binding: string;
  database_id?: string;
  database_name?: string;
}

export interface WorkerQueueConfig {
  producers?: { binding: string; queue: string }[];
  consumers?: { queue: string }[];
}

export interface WorkerSecretsStoreBinding {
  name?: string;
  secret_name: string;
  store_id?: string;
  binding?: string;
}

export interface WorkerConfigManifestLite {
  name?: string;
  account_id?: string;
  compatibility_date?: string;
  compatibility_flags?: string[];
  pages_build_output_dir?: string;
  services?: WorkerServiceBinding[];
  d1_databases?: WorkerD1Binding[];
  secrets_store?: { bindings?: WorkerSecretsStoreBinding[] };
  secrets_store_secrets?: WorkerSecretsStoreBinding[];
  queues?: WorkerQueueConfig;
  durable_objects?: { bindings?: { name: string; class_name: string }[] };
  migrations?: { tag: string; new_sqlite_classes?: string[] }[];
}

export interface HousekeepingCheck {
  worker: string;
  type: "error" | "warning" | "info";
  message: string;
}

export interface HousekeepingSummary {
  errors: number;
  warnings: number;
  info: number;
}

export interface HousekeepingPayload {
  timestamp: string;
  totalWorkers: number;
  checkedWorkers: number;
  issues: HousekeepingCheck[];
  summary: HousekeepingSummary;
}

export interface SettingsPayload {
  worker: string;
  key: string;
  value: string | number | boolean;
}

// --- Types needed by shared middleware and router ---

/**
 * Environment with bindings needed by the shared middleware.
 * Workers that use `requireAuth`, `createRateLimiter`, etc. have these bindings.
 *
 * This is intentionally a closed interface (no index signature) so accessing
 * unknown bindings is a compile error. Workers pass their extended Env types
 * via structural typing.
 */
export interface Env {
  /**
   * Preferred operator Bearer secret for management APIs (`requireOperatorAuth`).
   * Client sends the same value as `HOOX_API_TOKEN`.
   */
  OPERATOR_API_KEY?: string;
  /**
   * Legacy alias for operator Bearer auth (`requireAuth` / `requireOperatorAuth`).
   * Prefer `OPERATOR_API_KEY` for new deployments.
   */
  INTERNAL_API_KEY?: string;
  /** KV namespace for rate limiting (createRateLimiter) */
  CONFIG_KV?: KVNamespace;
  /** Optional analytics service binding for tracking */
  ANALYTICS_SERVICE?: Fetcher;
}

/**
 * Base environment type for workers with common Cloudflare bindings.
 * Workers should extend this with their specific bindings.
 */
export interface BaseEnv {
  /** Optional analytics service binding for tracking */
  ANALYTICS_SERVICE?: Fetcher;
  /** Optional KV namespace for configuration */
  CONFIG_KV?: KVNamespace;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// --- Trade and webhook types (consolidated) ---

export type TradeAction = z.infer<typeof TradeActionSchema>;

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export type TradeQueueMessage = z.infer<typeof TradeQueueMessageSchema>;

export type TradeSignal = z.infer<typeof TradeSignalSchema>;

export interface QueryPayload {
  query: string;
  params?: unknown[];
}

export interface BatchPayload {
  statements: QueryPayload[];
}

// --- Internal service-to-service request types ---

/**
 * Generic process request body for internal worker-to-worker calls.
 * The payload type varies per worker (WebhookPayload, NotificationPayload, etc.)
 */
export interface ProcessRequestBody<T = unknown> {
  requestId?: string;
  internalAuthKey?: string;
  payload: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// TUI / Dashboard display types (canonical definitions — see types.ts for re-exports)
// ─────────────────────────────────────────────────────────────────────────────

/** View identifier for TUI navigation. */
export type ViewId =
  | "dashboard"
  | "workers"
  | "worker-detail"
  | "trade-monitor"
  | "logs-viewer"
  | "service-manager"
  | "config-editor"
  | "setup-wizard"
  | "settings"
  | "queue-depth"
  | "kv-viewer"
  | "secrets-viewer"
  | "db-query"
  | "ai-chat"
  | "edge-topology"
  | "worker-settings";

// ─────────────────────────────────────────────────────────────────────────────
// Extension points for Open Core + Enterprise
// These lightweight types are part of the open core to allow easy extension.
// Heavy multi-tenant orchestration, billing, and proprietary logic live in
// the closed-source Enterprise layer (see OPEN_CORE_FEATURE_SPLIT.md).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight tenant identifier and basic context.
 * This type lives in the open core.
 *
 * Advanced tenant management, quotas, billing, and isolation enforcement
 * are part of the commercial Enterprise layer.
 */
export interface TenantContext {
  tenantId: string;
  strategyId?: string;
  fundId?: string;
  features?: string[]; // e.g. ["workflows", "realtime-ws"]
}

/**
 * Basic audit event shape.
 * Open core projects can emit these. Full compliance pipelines, retention,
 * SIEM export, and cryptographic signing are Enterprise features.
 */
export interface AuditEvent {
  timestamp: string;
  tenantId: string;
  traceId: string;
  eventType: string;
  actor: string;
  outcome: "success" | "failure" | "skipped";
  details?: Record<string, unknown>;
}

/**
 * Simple workflow step result type.
 * Useful for open core examples. Production-grade durable workflows,
 * human-in-the-loop, long-running state, and advanced orchestration
 * are provided in the Enterprise layer.
 */
export interface WorkflowStepResult<T = unknown> {
  step: string;
  success: boolean;
  data?: T;
  error?: string;
  retries?: number;
}

/** Modal dialog state for the TUI. */
export interface ModalState {
  type: "confirm" | "alert" | "prompt" | "custom";
  title: string;
  message?: string;
  data?: unknown;
  onConfirm?: () => void;
  onCancel?: () => void;
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export type WorkerStatus = "operational" | "degraded" | "down";

/**
 * Information about a Cloudflare Worker for the TUI dashboard.
 * Mirrors the data surfaced from the hoox-setup REST API.
 */
export interface WorkerInfo {
  id: string;
  name: string;
  status: WorkerStatus;
  /** Uptime in seconds */
  uptime: number;
  /** CPU usage percentage (0-100) */
  cpu: number;
  /** Memory usage in MB */
  memory: number;
  /** Total request count */
  requests: number;
  /** Number of Durable Object instances */
  durableObjectCount: number;
  /** Number of edge locations the worker is deployed to */
  edgeCount: number;
  /** Worker version string */
  version?: string;
  /** Last deployment timestamp in ms */
  lastDeployed?: number;
}

// ─── Trade ───────────────────────────────────────────────────────────────────

export type TradeSide = "buy" | "sell";

/**
 * A single trade event for the TUI trade monitor.
 */
export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  price: number;
  quantity: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  exchange: string;
  /** Optional strategy identifier */
  strategy?: string;
  /** Profit/Loss for this trade */
  pnl?: number;
}

// ─── Alert ───────────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "error" | "critical";

/**
 * A system alert surfaced in the TUI dashboard.
 */
export interface Alert {
  id: string;
  /** Alert category/type identifier */
  type: string;
  severity: AlertSeverity;
  message: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Optional linked worker ID */
  workerId?: string;
  acknowledged: boolean;
  /** Source of the alert */
  source?: string;
}

// ─── Log ─────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * A single log entry for the TUI logs viewer.
 */
export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  workerId?: string;
  source?: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/**
 * Aggregate system-level metrics for the TUI dashboard overview.
 */
export interface SystemMetrics {
  /** Total number of configured workers */
  totalWorkers: number;
  /** Workers currently operational */
  onlineWorkers: number;
  /** Total P&L in USD */
  totalPnl: number;
  /** Active trading strategies count */
  activeStrategies: number;
  /** Trades in the last 24 hours */
  dailyTrades: number;
  /** AI agent calls in the last 24 hours */
  aiCalls: number;
  /** System uptime in seconds */
  uptime: number;
  /** Last update timestamp in ms */
  lastUpdated: number;
}

// ─── Connection ──────────────────────────────────────────────────────────────

/** Connection status for the TUI data-fetching state machine. */
export type ConnectionStatus =
  | "connected"
  | "polling"
  | "offline"
  | "reconnecting";

// ─── Config ──────────────────────────────────────────────────────────────────

/** Log filtering preferences. */
export interface LogFilter {
  levels: LogLevel[];
  workers: string[];
  searchText: string;
}

/** Notification channel preferences. */
export interface NotificationPreferences {
  alerts: boolean;
  trades: boolean;
  debug: boolean;
  system: boolean;
}

// ─── CLI Bridge Errors ──────────────────────────────────────────────────────

/**
 * Classification of a CLI bridge failure.
 *
 * Used by the TUI status bar to surface actionable diagnostics when the
 * local `hoox` binary fails to execute. Each variant maps to a different
 * recovery path (e.g. "install the CLI" vs. "the command timed out").
 */
export type CliErrorType =
  /** The hoox binary could not be located on PATH or in the monorepo. */
  | "binary-not-found"
  /** The command exceeded its configured timeout. */
  | "timeout"
  /** The command was aborted via signal (user cancel or abort tag). */
  | "aborted"
  /** The process exited with a non-zero exit code. */
  | "non-zero-exit"
  /** Bun.spawn itself failed (permission denied, EACCES, etc.). */
  | "spawn-error";

/**
 * Structured CLI bridge failure details.
 *
 * Populated by `cli-bridge.exec()` and stored on `useServiceStore.lastErrorDetails`
 * so the status bar can render the full diagnostic context (command, exit code,
 * stderr) — not just a one-line summary. Click-to-expand reveals all fields and
 * the text remains selectable for copy/paste.
 */
export interface CliErrorDetails {
  /** Full command string (binary + args) that failed, e.g. "hoox check health". */
  command: string;
  /** Process exit code, or -1 if the process never started or was aborted. */
  exitCode: number;
  /** Captured stderr output (may be empty if the process wrote only to stdout). */
  stderr: string;
  /** Captured stdout output (truncated to 4 KB to keep the store lightweight). */
  stdout: string;
  /** Classification of the failure — drives icon + recovery hint. */
  errorType: CliErrorType;
  /** Wall-clock timestamp (ms) when the error was recorded. */
  timestamp: number;
  /** Wall-clock duration (ms) of the failed command, for slow-command diagnosis. */
  duration: number;
}
