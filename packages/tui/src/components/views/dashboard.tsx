/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Dashboard View — System health overview with service grid, alerts, and quick stats.
 *
 * Layout (vertical):
 *   1. Header: "DASHBOARD" title + animated connection status dot
 *   2. KillSwitchStatusBadge: live trade kill-switch indicator
 *   3. ServiceHealthGrid: worker cards with name + status indicator
 *   4. AlertsPanel: scrollable box with recent alerts, newest first
 *   5. QuickStatsRow: 4 metric cards with large numbers
 *
 * Follows Pattern 1 (View Composition) and Pattern 2 (Store Subscription).
 * Colors from design tokens via @jango-blockchained/hoox-shared. No CSS, no DOM.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useKeyboard } from "@opentui/react";
import { Colors, useServiceStore } from "@jango-blockchained/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { StatusDot } from "../shared/status-dot";
import { ViewHeader } from "../shared/view-header";
import { cliBridge } from "../../services/cli-bridge";
import { showConfirm } from "../ui/dialog";
import type { DialogHandle } from "../ui/dialog";
import { Spinner } from "../shared/spinner";
import {
  AutoRepairPanel,
  RepairFixItem,
  RepairState,
} from "./dashboard/auto-repair-panel";
import { ModelHealthSection } from "./dashboard/model-health-section";
import { AlertsPanel } from "./dashboard/alerts-panel";
import { useUIStore } from "@jango-blockchained/hoox-shared";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DashboardViewProps {
  /** Dialog handle for confirm prompts (from useDialog context) */
  dialog?: DialogHandle;
}

// ─── Number Formatter (Bebas-style large numbers) ────────────────────────────

/**
 * Format a number for the stats cards.
 * - ≥1M: "1.2M"
 * - ≥1K: "12.3K"
 * - else: comma-separated integer
 * - P&L gets +/- prefix
 */
function formatStatNumber(value: number, isPnl = false): string {
  if (isPnl) {
    const sign = value >= 0 ? "+" : "-";
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${abs.toFixed(2)}`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

/**
 * KillSwitchStatusBadge — Compact trade kill-switch indicator for the dashboard
 * header. Auto-refreshes on mount and shows the engaged/released state with a
 * color-coded status dot. Errors degrade gracefully (badge just shows UNKNOWN).
 */
function KillSwitchStatusBadge() {
  const [state, setState] = useState<"engaged" | "released" | "unknown">(
    "unknown"
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const result = await cliBridge.monitorKillSwitch("show");
      if (cancelled) return;
      if (result.success && result.data) {
        setState(result.data.engaged ? "engaged" : "released");
      } else {
        setState("unknown");
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    state === "engaged"
      ? "KILL SWITCH ENGAGED"
      : state === "released"
        ? "KILL SWITCH RELEASED"
        : "KILL SWITCH ?";
  const color =
    state === "engaged"
      ? Colors.error
      : state === "released"
        ? Colors.success
        : Colors.muted;
  const dotStatus: "operational" | "down" =
    state === "engaged"
      ? "down"
      : state === "released"
        ? "operational"
        : "down";

  return (
    <box flexDirection="row" gap={1}>
      <StatusDot status={dotStatus} pulse={state === "released"} />
      <text fg={color} bold={state === "engaged"}>
        {label}
      </text>
    </box>
  );
}

/**
 * DashboardHeader — view title with animated connection status
 * and auto-repair button, via shared ViewHeader chrome.
 */
function DashboardHeader({
  onRefresh,
  onRunAutoRepair,
  autoRepairRunning,
}: {
  onRefresh?: () => void;
  onRunAutoRepair?: () => void;
  autoRepairRunning?: boolean;
}) {
  const connectionStatus = useServiceStore((s) => s.connectionStatus);

  const statusLabel: Record<string, string> = {
    connected: "CONNECTED",
    polling: "POLLING",
    reconnecting: "RECONNECTING",
    offline: "OFFLINE",
  };

  // Divider lives below the kill-switch badge in the main layout —
  // avoid a second rule under the title alone.
  // Meta: sibling text nodes in a row box (no <text> nesting; no fragments).
  return (
    <ViewHeader
      title="DASHBOARD"
      showDivider={false}
      meta={
        <box flexDirection="row" gap={1}>
          <StatusDot
            status={
              connectionStatus === "connected"
                ? "operational"
                : connectionStatus === "polling"
                  ? "degraded"
                  : "down"
            }
            pulse={connectionStatus === "connected"}
          />
          <text dim fg={Colors.muted}>
            {statusLabel[connectionStatus] ?? connectionStatus.toUpperCase()}
          </text>
          <text fg={Colors.muted} onMouseUp={onRefresh}>
            [REFRESH]
          </text>
          <text
            fg={Colors.accent}
            bold
            onMouseUp={() => useUIStore.getState().setView("edge-topology")}
          >
            [TOPOLOGY]
          </text>
          <text
            fg={autoRepairRunning ? Colors.warning : Colors.accent}
            bold={!autoRepairRunning}
            dim={autoRepairRunning}
            onMouseUp={autoRepairRunning ? undefined : onRunAutoRepair}
          >
            {autoRepairRunning ? "[REPAIRING...]" : "[AUTO-REPAIR]"}
          </text>
        </box>
      }
    />
  );
}

/**
 * ServiceHealthGrid — displays all workers as a grid of status cards.
 * Each card shows: [█ ▌ ░] WORKER_NAME
 * Limited to first 10 workers (fits the dashboard layout).
 */
function ServiceHealthGrid() {
  const workers = useServiceStore((s) => s.workers);

  // Show first 10 workers (dashboard is an overview)
  const visibleWorkers = useMemo(() => workers.slice(0, 10), [workers]);

  if (workers.length === 0) {
    return (
      <box flexDirection="column" paddingY={1} alignItems="center">
        <Spinner label="Waiting for worker data..." />
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={0}>
      {/* Section label */}
      <text fg={Colors.foreground} bold dim>
        SERVICE HEALTH
      </text>

      {/* 2 rows × 5 columns grid */}
      <box
        flexDirection="row"
        flexWrap="wrap"
        gap={1}
        paddingTop={1}
        paddingBottom={1}
      >
        {visibleWorkers.map((worker, i) => (
          <box
            key={worker.id}
            flexDirection="row"
            width={28}
            gap={1}
            paddingLeft={1}
            paddingRight={1}
          >
            <StatusDot status={worker.status} />
            <text fg={Colors.foreground}>{worker.name}</text>
            {/* Fill remaining space with muted dots for alignment */}
            {i >= visibleWorkers.length && (
              <text fg={Colors.dim} dim>
                —
              </text>
            )}
          </box>
        ))}
      </box>

      {/* Fill empty slots in grid to maintain 10-card layout */}
      {visibleWorkers.length < 10 && (
        <box flexDirection="row" flexWrap="wrap" gap={1}>
          {Array.from({ length: 10 - visibleWorkers.length }).map((_, i) => (
            <box
              key={`empty-${i}`}
              flexDirection="row"
              width={28}
              gap={1}
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg={Colors.dim} dim>
                —
              </text>
              <text fg={Colors.dim} dim>
                —
              </text>
            </box>
          ))}
        </box>
      )}
    </box>
  );
}

/**
 * MetricCard — a single stat card with label and large formatted number.
 */

function MetricCard({
  label,
  value,
  color,
  isPnl = false,
}: {
  label: string;
  value: number;
  color: string;
  isPnl?: boolean;
}) {
  return (
    <box
      flexDirection="column"
      width={22}
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      backgroundColor={Colors.card}
      paddingX={1}
      paddingY={0}
    >
      {/* Label (dim, small) */}
      <box>
        <text fg={Colors.muted} dim>
          {label}
        </text>
      </box>

      {/* Value (large, colored) */}
      <box>
        <text fg={color} bold>
          {formatStatNumber(value, isPnl)}
        </text>
      </box>
    </box>
  );
}

/**
 * QuickStatsRow — row of 4 metric cards from SystemMetrics.
 * P&L, Active Strategies, Daily Trades, AI Calls.
 */
function QuickStatsRow() {
  const metrics = useServiceStore((s) => s.metrics);

  // Default values when metrics is null/unavailable
  const totalPnl = metrics?.totalPnl ?? 0;
  const activeStrategies = metrics?.activeStrategies ?? 0;
  const dailyTrades = metrics?.dailyTrades ?? 0;
  const aiCalls = metrics?.aiCalls ?? 0;

  return (
    <box flexDirection="column" gap={0}>
      <text fg={Colors.foreground} bold dim>
        QUICK STATS
      </text>

      <box flexDirection="row" gap={1} paddingTop={1}>
        <MetricCard
          label="P&L"
          value={totalPnl}
          color={totalPnl >= 0 ? Colors.success : Colors.error}
          isPnl
        />
        <MetricCard
          label="ACTIVE STRATEGIES"
          value={activeStrategies}
          color={Colors.accent}
        />
        <MetricCard
          label="DAILY TRADES"
          value={dailyTrades}
          color={Colors.info}
        />
        <MetricCard label="AI CALLS" value={aiCalls} color={Colors.accent} />
      </box>

      {/* Empty state when metrics unavailable */}
      {metrics === null && (
        <box paddingTop={1} alignItems="center">
          <Spinner label="Waiting for metrics data..." />
        </box>
      )}
    </box>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

/**
 * DashboardView — system health overview.
 *
 * Composes: Header → ServiceHealthGrid → AutoRepairPanel → AlertsPanel → QuickStatsRow
 * Wrapped in an ErrorBoundary for crash recovery.
 *
 * View subscribes to service-store (workers, alerts, metrics, connectionStatus)
 * and re-renders on data changes via Zustand selectors.
 */
export function DashboardView({ dialog }: DashboardViewProps = {}) {
  const [repairState, setRepairState] = useState<RepairState>({ kind: "idle" });

  const handleRefresh = async () => {
    const result = await cliBridge.monitorStatus();
    if (result.success) {
      // Clear any previous CLI error and refresh the data view.
      // Note: failed CLI calls propagate to the status bar automatically
      // via the global error sink registered in app.tsx.
      useServiceStore.getState().setLastErrorDetails(null);
      await useServiceStore.getState().fetchWorkers();
    }
  };

  const handleRunAutoRepair = useCallback(async () => {
    // Fail closed: never mutate config without an interactive confirm surface.
    if (!dialog) {
      useServiceStore.getState().addAlert({
        id: `repair-noconfirm-${Date.now()}`,
        type: "config",
        severity: "warning",
        message: "Auto-repair blocked: confirmation dialog unavailable",
        timestamp: Date.now(),
        acknowledged: false,
      });
      return;
    }
    const confirmed = await showConfirm(dialog, {
      title: "Run Auto-Repair?",
      message:
        "Auto-repair will apply non-destructive fixes to your configuration. " +
        "This creates placeholder .dev.vars files, adds compatibility flags, " +
        "and ensures worker configs are valid.",
      confirmLabel: "Run Repair",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setRepairState({ kind: "running" });
    try {
      const result = await cliBridge.checkFix();
      if (!result.success) {
        setRepairState({
          kind: "error",
          message: result.stderr || result.stdout || "unknown error from CLI",
        });
        useServiceStore.getState().addAlert({
          id: `repair-${Date.now()}`,
          type: "config",
          severity: "warning",
          message: `Auto-repair failed: ${result.stderr || result.stdout || "unknown error"}`,
          timestamp: Date.now(),
          acknowledged: false,
        });
        return;
      }

      // Parse the FixReport from the CLI response
      const data = result.data as {
        actions?: Array<{
          description: string;
          type: string;
          target: string;
          applied: boolean;
          error?: string;
        }>;
        summary?: {
          total: number;
          applied: number;
          skipped: number;
          failed: number;
        };
      } | null;

      if (!data || !Array.isArray(data.actions)) {
        setRepairState({
          kind: "error",
          message: "CLI did not return a valid FixReport (missing actions).",
        });
        return;
      }

      const items: RepairFixItem[] = data.actions.map((action) => ({
        description: action.description ?? "Unknown fix",
        type: (action.type as RepairFixItem["type"]) ?? "config",
        target: action.target ?? "",
        applied: Boolean(action.applied),
        error: action.error,
        timestamp: Date.now(),
      }));

      setRepairState({ kind: "results", items, durationMs: result.duration });

      // Add summary alert
      const applied = items.filter((i) => i.applied).length;
      const failed = items.filter((i) => i.error).length;
      useServiceStore.getState().addAlert({
        id: `repair-${Date.now()}`,
        type: "config",
        severity: failed > 0 ? "warning" : "info",
        message:
          failed > 0
            ? `Auto-repair completed: ${applied} applied, ${failed} failed`
            : `Auto-repair completed: ${applied} fix(es) applied`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRepairState({ kind: "error", message });
      useServiceStore.getState().addAlert({
        id: `repair-err-${Date.now()}`,
        type: "config",
        severity: "error",
        message: `Auto-repair error: ${message}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
  }, [dialog]);

  const dismissRepairPanel = useCallback(() => {
    setRepairState({ kind: "idle" });
  }, []);

  /** Re-run the auto-repair. */
  const rerunRepair = useCallback(() => {
    void handleRunAutoRepair();
  }, [handleRunAutoRepair]);

  // Dismiss repair panel on ESC key when visible
  useKeyboard((key) => {
    if (repairState.kind !== "idle" && key.name === "escape") {
      dismissRepairPanel();
    }
  });

  useEffect(() => {
    const runHealthCheck = async () => {
      const health = await cliBridge.checkHealth();
      if (health.success) {
        useServiceStore.getState().setLastErrorDetails(null);
        await useServiceStore.getState().fetchWorkers();
      }
      // Failure path: handled by the global error sink in app.tsx.
    };
    runHealthCheck();
  }, []);

  return (
    <ErrorBoundary viewName="Dashboard">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        {/* 1. Header: title + connection status */}
        <box>
          <DashboardHeader
            onRefresh={handleRefresh}
            onRunAutoRepair={handleRunAutoRepair}
            autoRepairRunning={repairState.kind === "running"}
          />
        </box>

        {/* 2. Kill-switch status badge — trading safety at a glance */}
        <box>
          <KillSwitchStatusBadge />
        </box>

        {/* Divider */}
        <box>
          <text fg={Colors.border} dim>
            {""}
            {"─".repeat(80)}
          </text>
        </box>

        {/* 3. Service health grid */}
        <box>
          <ServiceHealthGrid />
        </box>

        {/* Auto-repair results panel — persists until dismissed or ESC */}
        {repairState.kind !== "idle" && (
          <box>
            <AutoRepairPanel
              state={repairState}
              onDismiss={dismissRepairPanel}
              onRerun={rerunRepair}
            />
          </box>
        )}

        {/* 4. Alerts panel */}
        <box>
          <AlertsPanel />
        </box>

        {/* 5. Quick stats row */}
        <box>
          <QuickStatsRow />
        </box>

        {/* 6. AI model health section */}
        <box>
          <ModelHealthSection />
        </box>
      </box>
    </ErrorBoundary>
  );
}
