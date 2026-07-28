/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service Store — Worker data, live trades, alerts, logs, metrics, connection state.
 * Follows TUI Pattern 2: Store Subscription with selectors.
 *
 * Connection State Machine:
 *
 *   ┌──────────┐    fail     ┌──────────────┐   success    ┌───────────┐
 *   │ connected │ ──────────→ │ reconnecting │ ───────────→ │ connected │
 *   └──────────┘             └──────┬───────┘              └───────────┘
 *        ↑                          │
 *        │                  backoff exhausted
 *        │                          │
 *        │                          ▼
 *        │                   ┌──────────┐    manual     ┌───────────┐
 *        └─────────────────── │ offline  │ ────────────→ │ polling   │
 *              success        └──────────┘              └─────┬─────┘
 *                                                             │
 *                                                    fail     │
 *                                                      ┌──────┘
 *                                                      ▼
 *                                               ┌──────────┐
 *                                               │ offline  │
 *                                               └──────────┘
 *
 * Exponential backoff: 1s → 2s → 4s → 8s → 16s (max).
 * Tracks retryCount, lastError, and lastSuccessfulFetch for observability.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  WorkerInfo,
  Trade,
  Alert,
  LogEntry,
  SystemMetrics,
  ConnectionStatus,
  CliErrorDetails,
} from "../types";

// ─── Error Helpers ────────────────────────────────────────────────────────────

/**
 * Build a one-line summary of a `CliErrorDetails` payload. Used by the
 * status bar to keep the one-line display tidy while the full payload
 * lives on `lastErrorDetails` for the click-to-expand panel.
 *
 * Order of preference: stderr (first non-empty line) → stdout (first
 * non-empty line) → command. Truncated to 120 chars max so the summary
 * never wraps the status bar unexpectedly.
 */
function summarizeCliError(details: CliErrorDetails): string {
  const raw =
    details.stderr.trim() ||
    details.stdout.trim() ||
    details.command ||
    "Unknown CLI error";
  const firstLine = raw.split("\n", 1)[0] ?? "";
  const trimmed = firstLine.slice(0, 120).trimEnd();
  return trimmed.length > 0 ? trimmed : details.command;
}

// ─── Backoff Constants ───────────────────────────────────────────────────────

/** Backoff sequence: 1s, 2s, 4s, 8s, 16s */
const BACKOFF_SEQUENCE = [1000, 2000, 4000, 8000, 16000];
/** Maximum retry attempts before transitioning to offline */
const MAX_RETRIES = 5;

// ─── Ring Buffer Helper ──────────────────────────────────────────────────────

function ringPush<T>(arr: T[], item: T, max: number): T[] {
  const next = [...arr, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

// ─── State ───────────────────────────────────────────────────────────────────

export interface ServiceState {
  workers: WorkerInfo[];
  tradeStream: Trade[]; // ring buffer, newest last, max 500
  alerts: Alert[]; // max 100
  logs: LogEntry[]; // ring buffer, max 1000
  metrics: SystemMetrics | null;
  connectionStatus: ConnectionStatus;
  lastUpdated: number; // timestamp ms
  selectedWorkerId: string | null;

  // ── Connection state machine fields ──────────────────────────────────────
  /** Number of consecutive failed reconnection attempts */
  retryCount: number;
  /** Last connection error message (for display) */
  lastError: string | null;
  /**
   * Structured CLI bridge error details. Populated when a `hoox` command
   * fails so the status bar can render the full diagnostic context
   * (command, exit code, stderr, error type) — not just a one-line summary.
   * Cleared together with `lastError` on success or retry reset.
   */
  lastErrorDetails: CliErrorDetails | null;
  /** Timestamp (ms) of the last successful API fetch */
  lastSuccessfulFetch: number;
  /** Current backoff delay in ms (0 when not reconnecting) */
  reconnectDelay: number;
  /** Timestamp when the connection was lost (for downtime calculation) */
  disconnectedAt: number | null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface ServiceActions {
  fetchWorkers: () => Promise<void>;
  streamTrades: () => Promise<void>;
  streamLogs: () => Promise<void>;
  addAlert: (alert: Alert) => void;
  addAlerts: (alerts: Alert[]) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  selectWorker: (id: string | null) => void;
  setWorkers: (workers: WorkerInfo[]) => void;
  pushTrade: (trade: Trade) => void;
  pushLog: (log: LogEntry) => void;
  setMetrics: (metrics: SystemMetrics) => void;

  // ── Connection state machine actions ─────────────────────────────────────
  /** Called on successful API response — resets error state */
  handleConnectionSuccess: () => void;
  /** Called on API failure — increments retry, applies backoff */
  handleConnectionFailure: (errorMessage: string) => void;
  /** Reset all retry/reconnect state (on full reconnect) */
  resetRetries: () => void;
  /** Force a connection retry from offline state */
  forceRetry: () => void;
  /**
   * Record a structured CLI bridge failure. Stores both the short
   * `lastError` string (for the one-line summary) and the full
   * `lastErrorDetails` (for click-to-expand). Pass `null` to clear.
   */
  setLastErrorDetails: (details: CliErrorDetails | null) => void;
  /**
   * Clear the last error and last error details. Convenience alias for
   * `setLastErrorDetails(null)` — clearer at call sites where the
   * intent is to acknowledge an error rather than record a new one.
   */
  clearError: () => void;
  /**
   * Record a CLI bridge failure **and** add a matching high-severity
   * alert to the alerts ring buffer. Use this when a failure should
   * also be visible in the alerts panel (not just the status bar).
   */
  addCliErrorAlert: (details: CliErrorDetails) => void;
}

// ─── Buffer Caps ─────────────────────────────────────────────────────────────

const MAX_TRADES = 500;
const MAX_ALERTS = 100;
const MAX_LOGS = 1000;

// ─── Defaults ────────────────────────────────────────────────────────────────

const initialState: ServiceState = {
  workers: [],
  tradeStream: [],
  alerts: [],
  logs: [],
  metrics: null,
  connectionStatus: "offline",
  lastUpdated: 0,
  selectedWorkerId: null,
  // Connection machine defaults
  retryCount: 0,
  lastError: null,
  lastErrorDetails: null,
  lastSuccessfulFetch: 0,
  reconnectDelay: 0,
  disconnectedAt: null,
};

// ─── Backoff Helper ──────────────────────────────────────────────────────────

/**
 * Calculate the backoff delay for a given retry count.
 * Returns 0 if count is out of range.
 */
function getBackoffDelay(retryCount: number): number {
  if (retryCount <= 0) return 0;
  const index = Math.min(retryCount - 1, BACKOFF_SEQUENCE.length - 1);
  return BACKOFF_SEQUENCE[index];
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useServiceStore = create<ServiceState & ServiceActions>()(
  immer((set, get) => ({
    ...initialState,

    // ── Async: fetch workers from hoox-setup REST API ──────────────────────
    fetchWorkers: async () => {
      const { hooxFetch } = await import("../api-client");
      try {
        const data = await hooxFetch<WorkerInfo[]>("/v1/workers");
        set((state) => {
          state.workers = data;
          state.lastUpdated = Date.now();
          state.lastSuccessfulFetch = Date.now();
          // Transition: polling/reconnecting/offline → connected on success
          if (
            state.connectionStatus === "polling" ||
            state.connectionStatus === "reconnecting" ||
            state.connectionStatus === "offline"
          ) {
            state.connectionStatus = "connected";
            state.retryCount = 0;
            state.lastError = null;
            state.lastErrorDetails = null;
            state.reconnectDelay = 0;
            state.disconnectedAt = null;
          }
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Unknown fetch error";
        get().addAlert({
          id: crypto.randomUUID(),
          type: "connection",
          severity: "error",
          message: msg,
          timestamp: Date.now(),
          acknowledged: false,
        });
        set((state) => {
          // Always surface the failure reason (incl. auth) for status bar / toasts
          state.lastError = msg;
          state.disconnectedAt = state.disconnectedAt ?? Date.now();

          // Transition: connected/polling → reconnecting on failure
          if (
            state.connectionStatus === "connected" ||
            state.connectionStatus === "polling"
          ) {
            state.connectionStatus = "reconnecting";
            state.retryCount = state.retryCount + 1;

            // Check if backoff exhausted — transition to offline
            if (state.retryCount >= MAX_RETRIES) {
              state.connectionStatus = "offline";
              state.lastError = `Connection lost after ${MAX_RETRIES} retries`;
            } else {
              state.reconnectDelay = getBackoffDelay(state.retryCount);
            }
          } else if (state.connectionStatus === "reconnecting") {
            state.retryCount = state.retryCount + 1;
            if (state.retryCount >= MAX_RETRIES) {
              state.connectionStatus = "offline";
              state.lastError = `Connection lost after ${MAX_RETRIES} retries`;
              state.reconnectDelay = 0;
            } else {
              state.reconnectDelay = getBackoffDelay(state.retryCount);
            }
          }
          // offline: stay offline with lastError set (startup / remote miss)
        });
      }
    },

    // ── Async: stream trades via SSE ───────────────────────────────────────
    streamTrades: async () => {
      const { subscribeSSE } = await import("../sse");
      try {
        await subscribeSSE<Trade>("/v1/trades/stream", (trade) => {
          get().pushTrade(trade);
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "SSE trade stream failed";
        get().addAlert({
          id: crypto.randomUUID(),
          type: "connection",
          severity: "error",
          message: msg,
          timestamp: Date.now(),
          acknowledged: false,
        });
        get().handleConnectionFailure(msg);
      }
    },

    // ── Async: stream logs via SSE ─────────────────────────────────────────
    streamLogs: async () => {
      const { subscribeSSE } = await import("../sse");
      try {
        await subscribeSSE<LogEntry>("/v1/logs/stream", (log) => {
          get().pushLog(log);
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "SSE log stream failed";
        get().addAlert({
          id: crypto.randomUUID(),
          type: "connection",
          severity: "error",
          message: msg,
          timestamp: Date.now(),
          acknowledged: false,
        });
        get().handleConnectionFailure(msg);
      }
    },

    // ── Sync: add single alert ─────────────────────────────────────────────
    addAlert: (alert) =>
      set((state) => {
        state.alerts = ringPush(state.alerts, alert, MAX_ALERTS);
      }),

    // ── Sync: bulk add alerts ──────────────────────────────────────────────
    addAlerts: (alerts) =>
      set((state) => {
        const merged = [...state.alerts, ...alerts];
        state.alerts =
          merged.length > MAX_ALERTS
            ? merged.slice(merged.length - MAX_ALERTS)
            : merged;
      }),

    // ── Sync: connection state machine transition ──────────────────────────
    // Valid transitions:
    //   connected    → reconnecting (on failure)
    //   reconnecting → connected (on success) | offline (backoff exhausted)
    //   offline      → polling (manual retry)
    //   polling      → connected (on success) | offline (on failure)
    setConnectionStatus: (status) =>
      set((state) => {
        // Reset retry count on manual transitions to connected
        if (status === "connected") {
          state.retryCount = 0;
          state.lastError = null;
          state.lastErrorDetails = null;
          state.reconnectDelay = 0;
          state.disconnectedAt = null;
        }
        // Track disconnect time
        if (status === "offline" || status === "reconnecting") {
          state.disconnectedAt = state.disconnectedAt ?? Date.now();
        }
        state.connectionStatus = status;
      }),

    // ── Sync: select a worker for detail view ──────────────────────────────
    selectWorker: (id) =>
      set((state) => {
        state.selectedWorkerId = id;
      }),

    // ── Sync: replace worker list ──────────────────────────────────────────
    setWorkers: (workers) =>
      set((state) => {
        state.workers = workers;
        state.lastUpdated = Date.now();
      }),

    // ── Sync: push a single trade into the ring buffer ─────────────────────
    pushTrade: (trade) =>
      set((state) => {
        state.tradeStream = ringPush(state.tradeStream, trade, MAX_TRADES);
      }),

    // ── Sync: push a single log entry into the ring buffer ─────────────────
    pushLog: (log) =>
      set((state) => {
        state.logs = ringPush(state.logs, log, MAX_LOGS);
      }),

    // ── Sync: update aggregate system metrics ──────────────────────────────
    setMetrics: (metrics) =>
      set((state) => {
        state.metrics = metrics;
        state.lastUpdated = metrics.lastUpdated;
      }),

    // ── Connection State Machine: on success ───────────────────────────────
    handleConnectionSuccess: () =>
      set((state) => {
        state.lastSuccessfulFetch = Date.now();
        state.retryCount = 0;
        state.lastError = null;
        state.lastErrorDetails = null;
        state.reconnectDelay = 0;
        state.disconnectedAt = null;
        // Always mark connected (incl. offline → CLI/HTTP recovery)
        state.connectionStatus = "connected";
      }),

    // ── Connection State Machine: on failure ───────────────────────────────
    handleConnectionFailure: (errorMessage) =>
      set((state) => {
        state.lastError = errorMessage;
        state.disconnectedAt = state.disconnectedAt ?? Date.now();

        if (
          state.connectionStatus === "connected" ||
          state.connectionStatus === "polling"
        ) {
          state.connectionStatus = "reconnecting";
          state.retryCount = 1;
          state.reconnectDelay = getBackoffDelay(1);
        } else if (state.connectionStatus === "reconnecting") {
          state.retryCount = state.retryCount + 1;
          if (state.retryCount >= MAX_RETRIES) {
            state.connectionStatus = "offline";
            state.lastError = `Connection lost after ${MAX_RETRIES} retries`;
            state.reconnectDelay = 0;
          } else {
            state.reconnectDelay = getBackoffDelay(state.retryCount);
          }
        }
      }),

    // ── Reset all retry/reconnect state ────────────────────────────────────
    resetRetries: () =>
      set((state) => {
        state.retryCount = 0;
        state.lastError = null;
        state.lastErrorDetails = null;
        state.reconnectDelay = 0;
        state.disconnectedAt = null;
      }),

    // ── Force retry from offline state ─────────────────────────────────────
    forceRetry: () =>
      set((state) => {
        if (state.connectionStatus === "offline") {
          state.connectionStatus = "polling";
          state.retryCount = 0;
          state.lastError = null;
          state.lastErrorDetails = null;
          state.reconnectDelay = 0;
        }
      }),

    // ── Record structured CLI bridge error ────────────────────────────────
    // Accepts a fully-formed CliErrorDetails (typically from cli-bridge) and
    // mirrors a short summary into `lastError` so the rest of the status
    // bar (one-line truncated, alerts, retry counters) keeps working
    // without changes. Pass null to clear both fields.
    setLastErrorDetails: (details) =>
      set((state) => {
        state.lastErrorDetails = details;
        state.lastError = details === null ? null : summarizeCliError(details);
      }),

    // ── Clear error state (alias for setLastErrorDetails(null)) ───────────
    clearError: () =>
      set((state) => {
        state.lastError = null;
        state.lastErrorDetails = null;
      }),

    // ── Record CLI error + add a corresponding high-severity alert ─────────
    // Use this for failures that should be visible in the alerts panel
    // (e.g. persistent deploy failures) — the status bar alone is not
    // enough since the user may have collapsed it or moved on.
    addCliErrorAlert: (details) =>
      set((state) => {
        state.lastErrorDetails = details;
        state.lastError = summarizeCliError(details);
        const summary = summarizeCliError(details);
        state.alerts = ringPush(
          state.alerts,
          {
            id: crypto.randomUUID(),
            type: "connection" as const,
            severity: "error" as const,
            message: `CLI failure: ${summary}`,
            timestamp: Date.now(),
            acknowledged: false,
          },
          MAX_ALERTS
        );
      }),
  }))
);
