/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * WorkerDetail — deep-dive view into a single Cloudflare Worker.
 *
 * Layout:
 *   - Breadcrumb header: "← BACK | {worker.name} | {StatusDot} {status}"
 *   - 4-pane layout:
 *     1. Metrics   — uptime, CPU avg/p99, memory, requests, errors (from WorkerInfo)
 *     2. Live Logs — streaming log entries from store, auto-scroll, Space to pause, color-coded
 *     3. Durable Objects — list with name + status (derived from DO count)
 *     4. Config Preview — read-only key:value grid
 *   - Tab cycles focus between panes
 *   - Esc returns to workers overview via UI store goBack()
 *
 * Follows TUI Patterns 1 (View Composition), 2 (Store Subscription), 8 (ScrollBox).
 * Colors from @jango-blockchained/hoox-shared tokens — no hardcoded hex.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import {
  Colors,
  LogLevelColor,
  useServiceStore,
  useUIStore,
} from "@jango-blockchained/hoox-shared";
import { cliBridge } from "../../services/cli-bridge";
import { ErrorBoundary } from "../shared/error-boundary";
import { StatusDot, type StatusDotStatus } from "../shared/status-dot";
import { ViewHeader } from "../shared/view-header";

// ── Local type aliases (inferred from store return types) ──────────────────

/** Worker info shape — inferred from service-store WorkerInfo */
type Worker = ReturnType<typeof useServiceStore.getState>["workers"][number];

/** Log entry shape — inferred from service-store LogEntry */
type Log = ReturnType<typeof useServiceStore.getState>["logs"][number];

/** Log level type */
type Level = "debug" | "info" | "warn" | "error";

// ── Constants ────────────────────────────────────────────────────────────────

/** Number of focusable panes in the 2×2 grid */
const PANE_COUNT = 4;

const PANE_NAMES = [
  "Metrics",
  "Live Logs",
  "Durable Objects",
  "Config Preview",
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface DemoConfigEntry {
  key: string;
  value: string;
}

// ── Sub-components ───────────────────────────────────────────────────────────

/**
 * Breadcrumb header showing back navigation, worker name, and status indicator.
 */
function BreadcrumbHeader({ worker }: { worker: Worker }) {
  return (
    <ViewHeader
      title={worker.name}
      showDivider={false}
      meta={
        <box flexDirection="row" gap={2}>
          <text fg={Colors.muted} dim>
            ← BACK
          </text>
          <StatusDot
            status={worker.status as StatusDotStatus}
            pulse={worker.status === "operational"}
          />
          <text fg={Colors.foreground}>{worker.status.toUpperCase()}</text>
        </box>
      }
    />
  );
}

/**
 * Metrics pane — key health and performance indicators.
 */
function MetricsPane({ worker }: { worker: Worker }) {
  // WorkerInfo.cpu is a percentage (0–100), memory is MB used (no hard limit
  // is exposed by the API — do not invent a denominator or P99).
  const cpuPct = Number.isFinite(worker.cpu) ? worker.cpu : 0;
  const memMB = Number.isFinite(worker.memory) ? worker.memory : 0;
  const requests = Number.isFinite(worker.requests) ? worker.requests : 0;

  const rows: [string, string, string][] = [
    ["Uptime", formatUptime(worker.uptime), Colors.success],
    [
      "CPU",
      `${cpuPct.toFixed(1)}%`,
      cpuPct > 80
        ? Colors.error
        : cpuPct > 60
          ? Colors.warning
          : Colors.success,
    ],
    [
      "Memory",
      `${memMB.toFixed(0)} MB`,
      memMB > 100 ? Colors.warning : Colors.success,
    ],
    ["Requests (24h)", requests.toLocaleString(), Colors.info],
    ["DO count", String(worker.durableObjectCount ?? 0), Colors.muted],
    ["Edges", String(worker.edgeCount ?? 0), Colors.muted],
  ];

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      padding={1}
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      backgroundColor={Colors.card}
    >
      <text fg={Colors.accent} bold>
        Metrics
      </text>
      <box flexDirection="column" paddingTop={1} gap={0}>
        {rows.map(([label, value, color]) => (
          <box key={label} flexDirection="row" gap={1}>
            <text fg={Colors.muted} dim>
              {label.padEnd(14)}
            </text>
            <text fg={color}>{value}</text>
          </box>
        ))}
      </box>
    </box>
  );
}

/**
 * Live Logs pane — streaming log entries with auto-scroll and pause/resume.
 */
function LogsPane({
  workerId,
  focused,
}: {
  workerId: string;
  focused: boolean;
}) {
  // All logs from the ring buffer, filtered to this worker
  const allLogs = useServiceStore((s) => s.logs);
  const workerLogs = useMemo(
    () => allLogs.filter((l) => l.workerId === workerId),
    [allLogs, workerId]
  );

  // Pause toggle via Space key
  const [paused, setPaused] = useState(false);

  // Auto-scroll: track whether we're at the bottom
  const [, setAutoScroll] = useState(true);

  // When not paused, always show newest entries
  useEffect(() => {
    if (!paused) {
      setAutoScroll(true);
    }
  }, [workerLogs.length, paused]);

  // Keyboard: Space toggles pause when this pane is focused
  useKeyboard((key) => {
    if (!focused) return;
    if (key.name === "space") {
      setPaused((p) => !p);
    }
  });

  // Display logs: last 50 entries (or all if paused)
  const displayedLogs = useMemo(() => {
    const source = paused ? workerLogs : workerLogs.slice(-50);
    return source;
  }, [workerLogs, paused]);

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      padding={1}
      border={true}
      borderStyle="single"
      borderColor={focused ? Colors.accent : Colors.border}
      backgroundColor={Colors.card}
    >
      {/* Header with pause indicator */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={Colors.accent} bold>
          Live Logs
        </text>
        <box flexDirection="row" gap={1}>
          <text fg={paused ? Colors.warning : Colors.success}>
            {paused ? "⏸ PAUSED" : "▶ LIVE"}
          </text>
          {focused && (
            <text fg={Colors.muted} dim>
              [Space]
            </text>
          )}
        </box>
      </box>

      {/* Log entries in scrollable container */}
      <scrollbox width="100%" flexGrow={1} border={false}>
        {displayedLogs.length === 0 ? (
          <text fg={Colors.muted} dim>
            No logs yet...
          </text>
        ) : (
          displayedLogs.map((log) => <LogLine key={log.id} log={log} />)
        )}
      </scrollbox>
    </box>
  );
}

/** A single log line, color-coded by level */
function LogLine({ log }: { log: Log }) {
  const color = LogLevelColor[log.level as Level] ?? Colors.foreground;
  const time = new Date(log.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <text fg={color}>
      {time} [{log.level.toUpperCase().padEnd(5)}] {log.message}
    </text>
  );
}

/**
 * Durable Objects pane — count + honesty when names are unavailable.
 *
 * The Workers API currently exposes only `durableObjectCount`, not DO
 * names. We refuse to invent names (older UI fabricated
 * `{worker}-state|cache|queue`).
 */
function DurableObjectsPane({ worker }: { worker: Worker }) {
  const count = Math.max(0, worker.durableObjectCount ?? 0);
  const statusLabel =
    worker.status === "down"
      ? "worker down"
      : worker.status === "degraded"
        ? "degraded"
        : "operational";

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      padding={1}
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      backgroundColor={Colors.card}
    >
      <text fg={Colors.accent} bold>
        Durable Objects
      </text>
      <box flexDirection="column" paddingTop={1} gap={0}>
        <box flexDirection="row" gap={1}>
          <text fg={Colors.muted} dim>
            Count
          </text>
          <text fg={Colors.foreground} bold>
            {count}
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={Colors.muted} dim>
            Worker
          </text>
          <text
            fg={
              worker.status === "down"
                ? Colors.error
                : worker.status === "degraded"
                  ? Colors.warning
                  : Colors.success
            }
          >
            {statusLabel}
          </text>
        </box>
        <text fg={Colors.muted} dim>
          {count === 0
            ? "No Durable Objects reported for this worker."
            : "Names unavailable — API exposes count only."}
        </text>
      </box>
    </box>
  );
}

/**
 * Config Preview pane — read-only key:value pairs from CLI only.
 * Never invents demo exchanges/symbols when configShow is empty.
 */
function ConfigPreviewPane({
  worker,
  entries,
  loading,
}: {
  worker: Worker;
  entries?: DemoConfigEntry[];
  loading?: boolean;
}) {
  // Only show CLI-sourced entries — plus a short identity row from the worker.
  const displayEntries: DemoConfigEntry[] = useMemo(() => {
    if (entries && entries.length > 0) return entries;
    return [
      { key: "name", value: worker.name },
      { key: "status", value: worker.status },
      { key: "version", value: worker.version || "—" },
    ];
  }, [entries, worker]);

  const showingIdentityOnly = !entries || entries.length === 0;

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      padding={1}
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      backgroundColor={Colors.card}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={Colors.accent} bold>
          Config Preview
        </text>
        {loading && (
          <text fg={Colors.muted} dim>
            loading...
          </text>
        )}
      </box>
      {showingIdentityOnly && !loading && (
        <text fg={Colors.muted} dim>
          Live config unavailable · identity only
        </text>
      )}
      <box flexDirection="column" paddingTop={1} gap={0}>
        {displayEntries.map((entry) => (
          <box key={entry.key} flexDirection="row" gap={1}>
            <text fg={Colors.muted} dim>
              {entry.key.padEnd(14)}
            </text>
            <text fg={Colors.foreground}>{entry.value}</text>
          </box>
        ))}
      </box>
    </box>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format uptime seconds into a human-readable string. */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

// ── Main View ────────────────────────────────────────────────────────────────

export function WorkerDetail() {
  // Focus tracking for pane cycling
  const [focusPane, setFocusPane] = useState(0);

  // Live data state from CliBridge
  const [configEntries, setConfigEntries] = useState<DemoConfigEntry[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [, setCliLogsLoading] = useState(false);

  // Store subscriptions (Pattern 2: selective selectors)
  const selectedWorkerId = useServiceStore((s) => s.selectedWorkerId);
  const workers = useServiceStore((s) => s.workers);
  const connectionStatus = useServiceStore((s) => s.connectionStatus);
  const goBack = useUIStore((s) => s.goBack);

  // Derive the current worker
  const worker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId) ?? null,
    [workers, selectedWorkerId]
  );

  // ── CliBridge data fetching ─────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    if (!worker) return;
    setConfigLoading(true);
    try {
      const result = await cliBridge.configShow();
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>;
        setConfigEntries(
          Object.entries(data).map(([key, value]) => ({
            key,
            value:
              typeof value === "object" ? JSON.stringify(value) : String(value),
          }))
        );
      }
      useServiceStore.getState().addAlert({
        id: `cfg-${Date.now()}`,
        type: "config",
        severity: result.success ? "info" : "warning",
        message: result.success
          ? `Config loaded (${(result.duration / 1000).toFixed(1)}s)`
          : `Config load failed`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } catch {
      useServiceStore.getState().addAlert({
        id: `cfg-err-${Date.now()}`,
        type: "config",
        severity: "warning",
        message: "Config fetch error",
        timestamp: Date.now(),
        acknowledged: false,
      });
    } finally {
      setConfigLoading(false);
    }
  }, [worker]);

  const fetchLogs = useCallback(async () => {
    if (!worker) return;
    setCliLogsLoading(true);
    try {
      const result = await cliBridge.workerLogs(worker.name);
      if (result.success && Array.isArray(result.data)) {
        for (const log of result.data as Log[]) {
          useServiceStore.getState().pushLog(log);
        }
      }
      useServiceStore.getState().addAlert({
        id: `logs-${Date.now()}`,
        type: "logs",
        severity: result.success ? "info" : "warning",
        message: result.success
          ? `Logs loaded (${
              Array.isArray(result.data) ? result.data.length : 0
            } entries, ${(result.duration / 1000).toFixed(1)}s)`
          : `Logs load failed`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } catch {
      useServiceStore.getState().addAlert({
        id: `logs-err-${Date.now()}`,
        type: "logs",
        severity: "warning",
        message: "Logs fetch error",
        timestamp: Date.now(),
        acknowledged: false,
      });
    } finally {
      setCliLogsLoading(false);
    }
  }, [worker]);

  // Fetch live config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Fetch logs via CLI as fallback when SSE is not connected
  useEffect(() => {
    if (connectionStatus !== "connected") {
      fetchLogs();
    }
  }, [connectionStatus, fetchLogs]);

  const handleRefresh = useCallback(() => {
    fetchConfig();
    if (connectionStatus !== "connected") {
      fetchLogs();
    }
  }, [fetchConfig, fetchLogs, connectionStatus]);

  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "worker-detail";

  // View-local keyboard handling (only when this view is active)
  useKeyboard((key) => {
    if (!isActive) return;
    switch (key.name) {
      case "tab":
        // Cycle focus forward between panes
        setFocusPane((i) => (i + 1) % PANE_COUNT);
        break;
      case "escape":
        goBack();
        break;
    }
    if (key.ctrl && key.name === "r") {
      handleRefresh();
    }
  });

  // ── No worker selected or not found ────────────────────────────────────────
  if (!selectedWorkerId || !worker) {
    return (
      <ErrorBoundary viewName="Worker Detail">
        <box flexDirection="column" flexGrow={1} padding={2} gap={1}>
          <BreadcrumbHeader
            worker={{
              id: selectedWorkerId || "unknown",
              name: selectedWorkerId || "Unknown Worker",
              status: "down",
              uptime: 0,
              cpu: 0,
              memory: 0,
              requests: 0,
              durableObjectCount: 0,
              edgeCount: 0,
            }}
          />
          <box
            flexDirection="column"
            flexGrow={1}
            justifyContent="center"
            alignItems="center"
            gap={1}
          >
            <text fg={Colors.error} bold>
              Worker Not Found
            </text>
            <text fg={Colors.muted} dim>
              {selectedWorkerId
                ? `No worker with ID "${selectedWorkerId}" exists.`
                : "No worker selected. Use the Workers Overview to select one."}
            </text>
            <box paddingTop={1}>
              <text fg={Colors.accent} bg={Colors.card} onMouseUp={goBack}>
                {"  ← Back to Workers  "}
              </text>
            </box>
          </box>
        </box>
      </ErrorBoundary>
    );
  }

  // ── Full 4-pane layout ─────────────────────────────────────────────────────
  return (
    <ErrorBoundary viewName={`Worker: ${worker.name}`}>
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        {/* Breadcrumb header */}
        <BreadcrumbHeader worker={worker} />

        {/* 2×2 Grid of panes */}
        <box flexDirection="column" flexGrow={1} gap={1}>
          {/* Row 1: Metrics | Live Logs */}
          <box flexDirection="row" flexGrow={1} gap={1}>
            <MetricsPane worker={worker} />
            <LogsPane workerId={worker.id} focused={focusPane === 1} />
          </box>

          {/* Row 2: Durable Objects | Config Preview */}
          <box flexDirection="row" flexGrow={1} gap={1}>
            <DurableObjectsPane worker={worker} />
            <ConfigPreviewPane
              worker={worker}
              entries={configEntries}
              loading={configLoading}
            />
          </box>
        </box>

        {/* Footer: pane navigation hint */}
        <box flexDirection="row" justifyContent="space-between" paddingTop={0}>
          <box flexDirection="row" gap={1}>
            {PANE_NAMES.map((name, i) => (
              <text
                key={name}
                fg={i === focusPane ? Colors.accent : Colors.muted}
                bold={i === focusPane}
                dim={i !== focusPane}
              >
                {i === focusPane ? `▶ ${name}` : name}
              </text>
            ))}
          </box>
          <text fg={Colors.muted} dim>
            Tab: focus · Ctrl+R: refresh · Esc: back
          </text>
        </box>
      </box>
    </ErrorBoundary>
  );
}
