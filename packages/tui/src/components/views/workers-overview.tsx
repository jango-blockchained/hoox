/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Workers Overview — 2-column card grid displaying all Hoox Workers.
 *
 * Each card shows:
 *   - No.XX header with worker name and StatusDot
 *   - Uptime (formatted: 72h, 3d12h, etc.)
 *   - CPU (percentage, from 0-100)
 *   - Memory (used/128 MB)
 *   - Requests per 24h (formatted: 1.2K, 1.2M)
 *   - Durable Object count
 *   - Edge count
 *   - [View Details] [Logs] action buttons
 *
 * Arrow keys navigate the 2D grid (2 columns):
 *   left/right → move 1 card; up/down → move 2 cards (skip a row)
 * Enter on a focused card → selectWorker(id) + navigate to worker-detail view.
 *
 * Wrapped in ScrollBox for overflow when workers exceed viewport height.
 * Follows TUI Patterns 1 (View Composition), 2 (Store Subscription), 8 (ScrollBox).
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { Colors } from "@jango-blockchained/hoox-shared";
import { useServiceStore } from "@jango-blockchained/hoox-shared";
import { useUIStore } from "@jango-blockchained/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { StatusDot } from "../shared/status-dot";
import { Spinner, EmptyState } from "../shared/spinner";
import { Panel } from "../shared/panel";
import { ViewHeader } from "../shared/view-header";
import { cliBridge } from "../../services/cli-bridge";
import type { WorkerInfo } from "@jango-blockchained/hoox-shared";
import { showConfirm } from "../ui/dialog";
import type { DialogHandle } from "../ui/dialog";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WorkersOverviewProps {
  /** Dialog handle for deploy/restart confirmation (from DialogProvider). */
  dialog?: DialogHandle;
}

// ── Grid Constants ────────────────────────────────────────────────────────────

const COLS = 2;

// ── Formatting Helpers ────────────────────────────────────────────────────────

/** Convert uptime in seconds to a compact human-readable string. */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

/** Format large numbers with K/M suffixes. */
function formatCount(n: number): string {
  if (n >= 1_000_000) {
    const val = (n / 1_000_000).toFixed(1);
    return `${val.replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    const val = (n / 1_000).toFixed(1);
    return `${val.replace(/\.0$/, "")}K`;
  }
  return String(n);
}

/** Format CPU percentage (0-100). */
function formatCpu(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** Format memory as "used/128 MB". */
function formatMemory(mb: number): string {
  return `${Math.round(mb)}/128 MB`;
}

// ── Sub-component: Single Worker Card ─────────────────────────────────────────

interface WorkerCardProps {
  worker: WorkerInfo;
  index: number;
  focused: boolean;
  onViewDetails: () => void;
  onDeploy: () => void;
  onRestart: () => void;
  onLogs: () => void;
  isDeploying: boolean;
}

function WorkerCard({
  worker,
  index,
  focused,
  onViewDetails,
  onDeploy,
  onRestart,
  onLogs,
  isDeploying,
}: WorkerCardProps) {
  // elevated=false: card bg only when focused (matches prior DNA).
  // compact: avoid double padding with inner metric layout.
  return (
    <Panel focused={focused} elevated={false} compact flexGrow={1}>
      {/* Header row: No.XX + name + StatusDot */}
      <box flexDirection="row" gap={1} paddingX={1}>
        <text fg={Colors.accent} bold>
          No.{String(index + 1).padStart(2, "0")}
        </text>
        <text fg={Colors.foreground} bold>
          {worker.name.toUpperCase()}
        </text>
        <StatusDot
          status={worker.status}
          pulse={worker.status === "operational"}
        />
      </box>

      {/* Metrics — three 2-column rows (uppercase labels match landing page convention) */}
      <box flexDirection="column" paddingLeft={1} gap={0}>
        <box flexDirection="row" gap={2}>
          <text fg={Colors.muted}>UPTIME:</text>
          <text fg={Colors.foreground}>{formatUptime(worker.uptime)}</text>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={Colors.muted}>CPU AVG:</text>
          <text fg={Colors.foreground}>{formatCpu(worker.cpu)}</text>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={Colors.muted}>MEMORY:</text>
          <text fg={Colors.foreground}>{formatMemory(worker.memory)}</text>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={Colors.muted}>REQ/24H:</text>
          <text fg={Colors.foreground}>{formatCount(worker.requests)}</text>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={Colors.muted}>DOs:</text>
          <text fg={Colors.foreground}>{worker.durableObjectCount}</text>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={Colors.muted}>EDGES:</text>
          <text fg={Colors.foreground}>{worker.edgeCount}</text>
        </box>
      </box>

      {/* Action buttons */}
      <box flexDirection="row" gap={1} paddingTop={1} paddingX={1}>
        <text
          fg={focused ? Colors.accent : Colors.muted}
          bg={focused ? Colors.card : undefined}
          onMouseUp={onViewDetails}
        >
          [VIEW DETAILS]
        </text>
        <text
          fg={
            isDeploying ? Colors.muted : focused ? Colors.accent : Colors.muted
          }
          bg={focused ? Colors.card : undefined}
          onMouseUp={isDeploying ? undefined : onDeploy}
        >
          [DEPLOY]
        </text>
        <text
          fg={
            isDeploying ? Colors.muted : focused ? Colors.accent : Colors.muted
          }
          bg={focused ? Colors.card : undefined}
          onMouseUp={isDeploying ? undefined : onRestart}
        >
          [RESTART]
        </text>
        <text
          fg={
            isDeploying ? Colors.muted : focused ? Colors.accent : Colors.muted
          }
          bg={focused ? Colors.card : undefined}
          onMouseUp={isDeploying ? undefined : onLogs}
        >
          [LOGS]
        </text>
      </box>
    </Panel>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function WorkersOverview({ dialog }: WorkersOverviewProps = {}) {
  // ── 2D grid focus state ─────────────────────────────────────────────────
  const [focusedIndex, setFocusedIndex] = useState(0);

  // ── Deploy state ────────────────────────────────────────────────────────
  const [deployingWorker, setDeployingWorker] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState("");

  // ── Store subscriptions (selectors for performance) ─────────────────────
  const workers = useServiceStore((s) => s.workers);
  const connectionStatus = useServiceStore((s) => s.connectionStatus);
  const selectWorker = useServiceStore((s) => s.selectWorker);
  const setView = useUIStore((s) => s.setView);

  // ── CliBridge fallback: try CLI when API is unavailable ─────────────────
  const [cliFallbackTried, setCliFallbackTried] = useState(false);
  const [cliFallbackError, setCliFallbackError] = useState<string | null>(null);

  useEffect(() => {
    if (workers.length > 0) {
      setCliFallbackTried(false);
      setCliFallbackError(null);
      return;
    }
    if (cliFallbackTried) return;
    setCliFallbackTried(true);

    let cancelled = false;

    (async () => {
      try {
        const result = await cliBridge.monitorStatus();
        if (cancelled) return;
        if (result.success && result.data) {
          const raw = result.data as Record<string, unknown>;
          // CLI may return workers array, health object, or similar
          const rawWorkers = (raw.workers ?? raw.status ?? raw) as
            | unknown[]
            | Record<string, unknown>;
          const parsed = Array.isArray(rawWorkers)
            ? rawWorkers
            : typeof rawWorkers === "object" && rawWorkers !== null
              ? Object.values(rawWorkers)
              : [];
          if (parsed.length > 0) {
            const store = useServiceStore.getState();
            const workers: WorkerInfo[] = (
              parsed as Record<string, unknown>[]
            ).map((w, i) => {
              const cliStatus = String(w.status ?? "healthy");
              const status =
                cliStatus === "healthy"
                  ? "operational"
                  : cliStatus === "degraded"
                    ? "degraded"
                    : "down";
              return {
                id: String(w.id ?? w.worker ?? `worker-${i}`),
                name: String(w.worker ?? `worker-${i}`),
                status: status as WorkerInfo["status"],
                uptime: Number(w.uptime ?? 0) || 0,
                cpu: Number(w.cpu ?? 0) || 0,
                memory: Number(w.memory ?? 0) || 0,
                requests: Number(w.requests ?? 0) || 0,
                durableObjectCount: Number(w.durableObjectCount ?? 0) || 0,
                edgeCount: Number(w.edgeCount ?? 0) || 0,
                version: String(w.version ?? ""),
                lastDeployed: Number(w.lastDeployed ?? 0) || 0,
              };
            });
            store.setWorkers(workers);
            store.setMetrics({
              totalWorkers: workers.length,
              onlineWorkers: workers.filter((x) => x.status === "operational")
                .length,
              totalPnl: 0,
              activeStrategies: 0,
              dailyTrades: 0,
              aiCalls: 0,
              uptime: 0,
              lastUpdated: Date.now(),
            });
            store.handleConnectionSuccess();
            store.addAlert({
              id: `cli-fallback-${Date.now()}`,
              type: "info",
              severity: "info",
              message: "Workers loaded via CLI fallback (API unreachable)",
              timestamp: Date.now(),
              acknowledged: false,
            });
            return;
          }
        }
      } catch {
        // CLI also unavailable — show improved empty state below
      }
      if (!cancelled) {
        setCliFallbackError(
          "CLI unavailable. Run `hoox dev start` locally or deploy to Cloudflare."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workers.length, cliFallbackTried]);

  // ── Derived grid dimensions ─────────────────────────────────────────────
  const maxIndex = Math.max(0, workers.length - 1);

  /** Group workers into rows of 2 for the 2-column grid. */
  const rows: WorkerInfo[][] = useMemo(() => {
    const result: WorkerInfo[][] = [];
    for (let i = 0; i < workers.length; i += COLS) {
      result.push(workers.slice(i, i + COLS));
    }
    return result;
  }, [workers]);

  // Clamp focusedIndex when worker list changes
  const safeIndex = Math.min(focusedIndex, maxIndex);

  // ── View-local keyboard: 2D grid navigation ─────────────────────────────
  useKeyboard((key) => {
    switch (key.name) {
      case "up":
        setFocusedIndex((i) => Math.max(0, i - COLS));
        break;
      case "down":
        setFocusedIndex((i) => Math.min(maxIndex, i + COLS));
        break;
      case "left":
        setFocusedIndex((i) => Math.max(0, i - 1));
        break;
      case "right":
        setFocusedIndex((i) => Math.min(maxIndex, i + 1));
        break;
      case "enter": {
        const worker = workers[safeIndex];
        if (worker) {
          selectWorker(worker.id);
          setView("worker-detail");
        }
        break;
      }
    }
  });

  // ── Action Handlers ─────────────────────────────────────────────────────
  const onProgress = useCallback((chunk: string) => {
    setDeployProgress((prev) => (prev + chunk).slice(-2000));
  }, []);

  const handleLogs = useCallback(
    async (worker: WorkerInfo) => {
      if (deployingWorker) return;
      try {
        const result = await cliBridge.workerLogs(worker.name);
        useServiceStore.getState().addAlert({
          id: `logs-${Date.now()}-${worker.name}`,
          type: "logs",
          severity: result.success ? "info" : "warning",
          message: result.success
            ? `${worker.name} logs retrieved (${(result.duration / 1000).toFixed(1)}s)`
            : `${worker.name} logs failed: ${result.stderr || result.stdout || "unknown error"}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
      } catch (err) {
        useServiceStore.getState().addAlert({
          id: `logs-err-${Date.now()}`,
          type: "logs",
          severity: "warning",
          message: `${worker.name} logs error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
      }
    },
    [deployingWorker]
  );

  const handleDeploy = useCallback(
    async (worker: WorkerInfo) => {
      if (deployingWorker) return;
      // Fail closed: never deploy without an interactive confirm surface.
      if (!dialog) {
        useServiceStore.getState().addAlert({
          id: `deploy-noconfirm-${Date.now()}`,
          type: "deploy",
          severity: "warning",
          message: `Deploy blocked: confirmation dialog unavailable for ${worker.name}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        return;
      }
      const confirmed = await showConfirm(dialog, {
        title: `Deploy ${worker.name}`,
        message: `Publish the latest code for ${worker.name} to Cloudflare? This replaces the current deployment.`,
        confirmLabel: "Deploy",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;

      setDeployingWorker(worker.name);
      setDeployProgress("");
      try {
        const result = await cliBridge.deployWorker(worker.name, onProgress);
        const store = useServiceStore.getState();
        store.addAlert({
          id: `deploy-${Date.now()}-${worker.name}`,
          type: "deploy",
          severity: result.success ? "info" : "warning",
          message: result.success
            ? `${worker.name} deployed (${(result.duration / 1000).toFixed(1)}s)`
            : `${worker.name} deploy failed: ${result.stderr || result.stdout || "unknown error"}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        if (result.success) await store.fetchWorkers();
      } catch (err) {
        useServiceStore.getState().addAlert({
          id: `deploy-err-${Date.now()}`,
          type: "deploy",
          severity: "warning",
          message: `${worker.name} deploy error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
      } finally {
        setDeployingWorker(null);
      }
    },
    [deployingWorker, onProgress, dialog]
  );

  const handleRestart = useCallback(
    async (worker: WorkerInfo) => {
      if (deployingWorker) return;
      if (!dialog) {
        useServiceStore.getState().addAlert({
          id: `restart-noconfirm-${Date.now()}`,
          type: "restart",
          severity: "warning",
          message: `Restart blocked: confirmation dialog unavailable for ${worker.name}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        return;
      }
      const confirmed = await showConfirm(dialog, {
        title: `Restart ${worker.name}`,
        message: `Restart ${worker.name}? Running tasks will be drained before the worker is repaired/restarted.`,
        confirmLabel: "Restart",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;

      setDeployingWorker(worker.name);
      setDeployProgress("");
      try {
        const result = await cliBridge.repairWorker(worker.name, onProgress);
        const store = useServiceStore.getState();
        store.addAlert({
          id: `restart-${Date.now()}-${worker.name}`,
          type: "restart",
          severity: result.success ? "info" : "warning",
          message: result.success
            ? `${worker.name} restarted (${(result.duration / 1000).toFixed(1)}s)`
            : `${worker.name} restart failed: ${result.stderr || result.stdout || "unknown error"}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        if (result.success) await store.fetchWorkers();
      } catch (err) {
        useServiceStore.getState().addAlert({
          id: `restart-err-${Date.now()}`,
          type: "restart",
          severity: "warning",
          message: `${worker.name} restart error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
      } finally {
        setDeployingWorker(null);
      }
    },
    [deployingWorker, onProgress, dialog]
  );

  // ── Escape hatch: empty state ───────────────────────────────────────────
  if (workers.length === 0) {
    return (
      <ErrorBoundary viewName="Workers Overview">
        <box flexDirection="column" flexGrow={1} padding={2} gap={1}>
          <text fg={Colors.accent} bold>
            Workers
          </text>
          <EmptyState
            message="No workers connected. Check your hoox-setup deployment."
            icon="🔌"
          />
          {connectionStatus === "connected" && (
            <text fg={Colors.warning}>
              API is reachable but returned 0 workers.
            </text>
          )}
          {connectionStatus !== "connected" && cliFallbackError && (
            <text fg={Colors.warning}>
              API unavailable — CLI fallback attempted
            </text>
          )}
          {connectionStatus !== "connected" && !cliFallbackTried && (
            <box alignItems="center">
              <Spinner label="Checking via CLI..." />
            </box>
          )}
          {connectionStatus !== "connected" && cliFallbackError && (
            <box flexDirection="column" gap={0} marginTop={1}>
              <text fg={Colors.muted}>Suggestions:</text>
              <box flexDirection="row" gap={1}>
                <text fg={Colors.muted}>• Start the dev server:</text>
                <text fg={Colors.accent}>hoox dev start</text>
              </box>
              <box flexDirection="row" gap={1}>
                <text fg={Colors.muted}>• Deploy workers to Cloudflare:</text>
                <text fg={Colors.accent}>hoox workers deploy</text>
              </box>
              <box flexDirection="row" gap={1}>
                <text fg={Colors.muted}>• Check worker health:</text>
                <text fg={Colors.accent}>hoox monitor status</text>
              </box>
            </box>
          )}
        </box>
      </ErrorBoundary>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary viewName="Workers Overview">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        {/* Header */}
        <ViewHeader
          title="Workers"
          showDivider={false}
          meta={<text fg={Colors.muted}>{workers.length} total</text>}
        />

        {/* Deploy progress */}
        {deployingWorker && (
          <box flexDirection="column" gap={0}>
            <text fg={Colors.accent}>DEPLOYING {deployingWorker}...</text>
            {deployProgress && (
              <text fg={Colors.muted} dim>
                {deployProgress.slice(-200)}
              </text>
            )}
          </box>
        )}

        {/* Scrollable 2-column card grid */}
        <scrollbox width="100%" flexGrow={1} border={false}>
          <box flexDirection="column" gap={1}>
            {rows.map((row, rowIdx) => (
              <box key={rowIdx} flexDirection="row" gap={1}>
                {row.map((worker, colIdx) => {
                  const globalIdx = rowIdx * COLS + colIdx;
                  return (
                    <WorkerCard
                      key={worker.id}
                      worker={worker}
                      index={globalIdx}
                      focused={globalIdx === safeIndex}
                      onViewDetails={() => {
                        selectWorker(worker.id);
                        setView("worker-detail");
                      }}
                      onDeploy={() => handleDeploy(worker)}
                      onRestart={() => handleRestart(worker)}
                      onLogs={() => handleLogs(worker)}
                      isDeploying={deployingWorker === worker.name}
                    />
                  );
                })}
              </box>
            ))}
          </box>
        </scrollbox>
      </box>
    </ErrorBoundary>
  );
}
