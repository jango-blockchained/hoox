/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Service Manager View — Worker deploy/restart controls, edge location map,
 * and bulk actions for the Hoox TUI dashboard.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │  SERVICE MANAGER              Edge: 275+    │
 *   │─────────────────────────────────────────────│
 *   │  Workers (scrollable)    │  Edge Map (grid) │
 *   │  █ worker-alpha [Deploy] │  ● SFO  ● LHR   │
 *   │  ▌ worker-beta  [Restart]│  ● SIN  ● NRT   │
 *   │  ░ worker-gamma [Deploy] │  ...             │
 *   │─────────────────────────────────────────────│
 *   │  [Deploy All]    [Restart All]              │
 *   │─────────────────────────────────────────────│
 *   │  KILL SWITCH  ● RELEASED [Engage] [Release]│
 *   └─────────────────────────────────────────────┘
 *
 * Uses Colors tokens, useServiceStore, StatusDot, and showConfirm dialog.
 */
import { useState, useCallback, useEffect } from "react";
import { useServiceStore } from "@hoox-sh/hoox-shared/stores/service-store";
import { Colors, ConnectionStatusColor } from "@hoox-sh/hoox-shared";
import { StatusDot } from "../shared/status-dot";
import { ErrorBoundary } from "../shared/error-boundary";
import { EmptyState } from "../shared/spinner";
import { ViewHeader } from "../shared/view-header";
import { Panel } from "../shared/panel";
import { showConfirm } from "../ui/dialog";
import type { DialogHandle } from "../ui/dialog";
import type { WorkerInfo } from "@hoox-sh/hoox-shared/types";
import { cliBridge } from "../../services/cli-bridge";
import type { KillSwitchStatus } from "../../services/cli-bridge";
import type { CliResult } from "../../types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServiceManagerProps {
  /** Dialog handle for confirm prompts (from useDialog context) */
  dialog?: DialogHandle;
}

/** A single edge location on the world map */
interface EdgeLocation {
  code: string; // IATA/ICAO airport code
  city: string; // City name for display
  x: number; // Approximate column on the map grid
  y: number; // Approximate row on the map grid
  latency: number; // Simulated latency in ms
}

// ─── Edge map data ──────────────────────────────────────────────────────────

/**
 * Approximate geo-positions mapped to a terminal character grid.
 * Grid is ~60 cols x ~12 rows. Each dot is a Cloudflare edge PoP.
 */
const EDGE_LOCATIONS: EdgeLocation[] = [
  { code: "SFO", city: "San Francisco", x: 4, y: 3, latency: 2 },
  { code: "LAX", city: "Los Angeles", x: 3, y: 4, latency: 3 },
  { code: "SEA", city: "Seattle", x: 3, y: 2, latency: 5 },
  { code: "DFW", city: "Dallas", x: 8, y: 4, latency: 10 },
  { code: "ORD", city: "Chicago", x: 12, y: 3, latency: 12 },
  { code: "ATL", city: "Atlanta", x: 14, y: 5, latency: 14 },
  { code: "MIA", city: "Miami", x: 15, y: 6, latency: 16 },
  { code: "LHR", city: "London", x: 28, y: 3, latency: 28 },
  { code: "AMS", city: "Amsterdam", x: 30, y: 2, latency: 30 },
  { code: "FRA", city: "Frankfurt", x: 32, y: 3, latency: 32 },
  { code: "CDG", city: "Paris", x: 29, y: 4, latency: 29 },
  { code: "NRT", city: "Tokyo", x: 48, y: 4, latency: 48 },
  { code: "ICN", city: "Seoul", x: 46, y: 3, latency: 45 },
  { code: "SIN", city: "Singapore", x: 44, y: 8, latency: 44 },
  { code: "SYD", city: "Sydney", x: 50, y: 10, latency: 52 },
  { code: "GRU", city: "São Paulo", x: 18, y: 9, latency: 20 },
];

const MAP_WIDTH = 60;
const MAP_HEIGHT = 12;

// ─── Edge Map Component ─────────────────────────────────────────────────────

function EdgeMap() {
  // Track which location is currently hovered/selected
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  // Build a sparse grid: for each cell, find the location (if any)
  const locationByCell = new Map<string, EdgeLocation>();
  for (const loc of EDGE_LOCATIONS) {
    locationByCell.set(`${loc.y},${loc.x}`, loc);
  }

  const selectedLocation = EDGE_LOCATIONS.find((l) => l.code === selectedCode);

  return (
    <box flexDirection="column" flexGrow={1} gap={0}>
      {/* Map header */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={Colors.accent} bold>
          <b>EDGE NETWORK</b>
        </text>
        <text fg={Colors.warning} dim>
          schematic · not live CF
        </text>
        <text fg={Colors.muted}>{EDGE_LOCATIONS.length} sample PoPs</text>
      </box>

      {/* Map grid (outer Panel provides border) */}
      <box flexDirection="column" gap={0} paddingX={1} paddingY={0}>
        {Array.from({ length: MAP_HEIGHT }, (_, row) => (
          <box key={`map-row-${row}`} flexDirection="row" gap={0}>
            {Array.from({ length: MAP_WIDTH }, (_, col) => {
              const loc = locationByCell.get(`${row},${col}`);
              if (loc) {
                const isSelected = selectedCode === loc.code;
                return (
                  <text
                    key={loc.code}
                    fg={isSelected ? Colors.accent : Colors.info}
                    bold={isSelected}
                    onMouseUp={() =>
                      setSelectedCode(
                        selectedCode === loc.code ? null : loc.code
                      )
                    }
                  >
                    ●
                  </text>
                );
              }
              return (
                <text key={`empty-${row}-${col}`} fg={Colors.dim}>
                  {" "}
                </text>
              );
            })}
          </box>
        ))}
      </box>

      {/* Hover/select detail bar — shows city + latency */}
      <box
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        justifyContent="space-between"
      >
        {selectedLocation ? (
          <box flexDirection="row" gap={2}>
            <text fg={Colors.accent} bold>
              {selectedLocation.code}
            </text>
            <text fg={Colors.foreground}>{selectedLocation.city}</text>
            <text fg={Colors.info}>{selectedLocation.latency}ms</text>
          </box>
        ) : (
          <text fg={Colors.muted} dim>
            Click a ● for sample city · map is illustrative only
          </text>
        )}
      </box>
    </box>
  );
}

// ─── Worker Control Row ─────────────────────────────────────────────────────

interface WorkerRowProps {
  worker: WorkerInfo;
  index: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDeploy: (worker: WorkerInfo) => void;
  onRestart: (worker: WorkerInfo) => void;
  deployingWorker?: string | null;
}

function WorkerRow({
  worker,
  index,
  selectedIndex,
  onSelect,
  onDeploy,
  onRestart,
  deployingWorker,
}: WorkerRowProps) {
  const isSelected = index === selectedIndex;
  const bgColor = isSelected ? Colors.card : undefined;
  const isDeploying = deployingWorker === worker.name;

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={bgColor}
    >
      {/* Selectable area (status dot + name) */}
      <box
        flexDirection="row"
        gap={1}
        flexGrow={1}
        onMouseUp={() => onSelect(index)}
      >
        <StatusDot
          status={worker.status}
          pulse={worker.status === "operational"}
        />
        <text
          fg={isSelected ? Colors.accent : Colors.foreground}
          bold={isSelected}
        >
          {worker.name}
        </text>
      </box>

      {/* Per-worker action buttons */}
      <box flexDirection="row" gap={1}>
        <text
          fg={isDeploying ? Colors.muted : Colors.accent}
          bg={Colors.card}
          dim={isDeploying}
          onMouseUp={isDeploying ? undefined : () => onDeploy(worker)}
        >
          {" Deploy "}
        </text>
        <text
          fg={isDeploying ? Colors.muted : Colors.warning}
          bg={Colors.card}
          dim={isDeploying}
          onMouseUp={isDeploying ? undefined : () => onRestart(worker)}
        >
          {" Restart "}
        </text>
      </box>
    </box>
  );
}

// ─── Worker Control List ────────────────────────────────────────────────────

interface WorkerControlListProps {
  workers: WorkerInfo[];
  onDeploy: (worker: WorkerInfo) => void;
  onRestart: (worker: WorkerInfo) => void;
  deployingWorker?: string | null;
}

function WorkerControlList({
  workers,
  onDeploy,
  onRestart,
  deployingWorker,
}: WorkerControlListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <box flexDirection="column" flexGrow={1} gap={0}>
      {/* List header */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={Colors.accent} bold>
          <b>WORKERS</b>
        </text>
        <text fg={Colors.muted}>{workers.length} total</text>
      </box>

      {/* Column header */}
      <box flexDirection="row" paddingLeft={1} paddingRight={1} gap={1}>
        <text fg={Colors.muted} dim>
          Status
        </text>
        <text fg={Colors.muted} dim flexGrow={1}>
          Worker Name
        </text>
        <text fg={Colors.muted} dim>
          Actions
        </text>
      </box>

      {/* Scrollable worker list */}
      <scrollbox width="100%" flexGrow={1}>
        {workers.length === 0 ? (
          <box padding={1} flexGrow={1}>
            <EmptyState
              message="No workers registered."
              suggestion="Run setup to deploy workers."
              icon="⚙️"
            />
          </box>
        ) : (
          workers.map((worker, i) => (
            <WorkerRow
              key={worker.id}
              worker={worker}
              index={i}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onDeploy={onDeploy}
              onRestart={onRestart}
              deployingWorker={deployingWorker}
            />
          ))
        )}
      </scrollbox>
    </box>
  );
}

// ─── Bulk Actions Bar ───────────────────────────────────────────────────────

interface BulkActionsProps {
  workers: WorkerInfo[];
  onDeployAll: () => void;
  onRestartAll: () => void;
  deployingWorker?: string | null;
}

function BulkActions({
  workers,
  onDeployAll,
  onRestartAll,
  deployingWorker,
}: BulkActionsProps) {
  const operationalCount = workers.filter(
    (w) => w.status === "operational"
  ).length;
  const canAct = workers.length > 0 && !deployingWorker;
  const deployDim = !canAct || !!deployingWorker;
  const restartDim = !canAct || !!deployingWorker;

  return (
    <Panel elevated={false} compact>
      <box flexDirection="row" justifyContent="space-between">
        {/* Status summary */}
        <box flexDirection="row" gap={1}>
          <text fg={Colors.success}>{operationalCount} up</text>
          <text fg={Colors.muted}>/</text>
          <text fg={Colors.muted}>
            {workers.length - operationalCount} down
          </text>
        </box>

        {/* Bulk action buttons */}
        <box flexDirection="row" gap={2}>
          <text
            fg={canAct ? Colors.accent : Colors.muted}
            bg={canAct ? Colors.card : undefined}
            dim={deployDim}
            onMouseUp={canAct ? onDeployAll : undefined}
          >
            {"  [Deploy All]  "}
          </text>
          <text
            fg={canAct ? Colors.warning : Colors.muted}
            bg={canAct ? Colors.card : undefined}
            dim={restartDim}
            onMouseUp={canAct ? onRestartAll : undefined}
          >
            {"  [Restart All]  "}
          </text>
        </box>
      </box>
    </Panel>
  );
}

// ─── Kill-Switch Section ────────────────────────────────────────────────────

/**
 * Render a timestamp (ms or ISO string) as a compact HH:MM:SS label.
 * Falls back to a dash when the input is invalid.
 */
function formatKillSwitchTime(input: string | number | null): string {
  if (input === null) return "—";
  const ms = typeof input === "number" ? input : Date.parse(input);
  if (Number.isNaN(ms)) return "—";
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

interface KillSwitchSectionProps {
  dialog?: DialogHandle;
  onAlert: (
    id: string,
    type: string,
    result: CliResult,
    successMsg: string,
    failMsg: string
  ) => void;
}

/**
 * KillSwitchSection — Emergency-stop control panel for the global trade kill
 * switch. Shows the current state, lets the user engage/release it, and
 * dispatches alerts on success/failure. Engages always require confirmation
 * (trading safety) and releases confirm as well to prevent accidents.
 */
function KillSwitchSection({ dialog, onAlert }: KillSwitchSectionProps) {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await cliBridge.monitorKillSwitch("show");
    if (result.success && result.data) {
      setStatus(result.data);
      setError(null);
    } else {
      setError(
        result.stderr || result.stdout || "Failed to read kill switch status"
      );
    }
    setLoading(false);
  }, []);

  // Auto-refresh on mount (with cancellation on unmount)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      const result = await cliBridge.monitorKillSwitch("show");
      if (cancelled) return;
      if (result.success && result.data) {
        setStatus(result.data);
        setError(null);
      } else {
        setError(
          result.stderr || result.stdout || "Failed to read kill switch status"
        );
      }
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const setEngaged = useCallback(
    async (engaged: boolean) => {
      if (!dialog || loading) return;
      const action: "engage" | "release" = engaged ? "engage" : "release";
      const verb = engaged ? "ENGAGE" : "RELEASE";
      const confirmTitle = engaged
        ? "Engage Kill Switch?"
        : "Release Kill Switch?";
      const confirmMessage = engaged
        ? "This will HALT all trading activity immediately. " +
          "Active signals will be rejected until the kill switch is released. Continue?"
        : "This will RESUME normal trading operations. " +
          "All queued signals will be processed. Continue?";
      const confirmed = await showConfirm(dialog, {
        title: confirmTitle,
        message: confirmMessage,
        confirmLabel: verb,
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;

      setLoading(true);
      setError(null);
      const result = await cliBridge.monitorKillSwitch(action);
      if (result.success && result.data) {
        setStatus(result.data);
        setError(null);
        onAlert(
          `killswitch-${Date.now()}`,
          "killswitch",
          result,
          `Kill switch ${engaged ? "engaged" : "released"} (${(result.duration / 1000).toFixed(1)}s)`,
          `Kill switch ${engaged ? "engage" : "release"} failed: ${
            result.stderr || result.stdout || "unknown error"
          }`
        );
      } else {
        setError(
          result.stderr ||
            result.stdout ||
            `Failed to ${verb.toLowerCase()} kill switch`
        );
        onAlert(
          `killswitch-err-${Date.now()}`,
          "killswitch",
          result,
          `Kill switch ${engaged ? "engaged" : "released"}`,
          `Kill switch ${engaged ? "engage" : "release"} error: ${
            result.stderr || result.stdout || "unknown error"
          }`
        );
      }
      setLoading(false);
    },
    [dialog, loading, onAlert]
  );

  // Visual state — unknown when status hasn't loaded yet
  const engaged = status?.engaged ?? false;
  const stateLabel =
    status === null ? "UNKNOWN" : engaged ? "ENGAGED" : "RELEASED";
  const stateColor =
    status === null ? Colors.muted : engaged ? Colors.error : Colors.success;
  const dotStatus: "operational" | "down" = engaged ? "down" : "operational";
  const engageDisabled = loading || engaged;
  const releaseDisabled = loading || !engaged;

  return (
    <Panel
      elevated={false}
      compact
      borderColor={engaged ? Colors.error : undefined}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        {/* Status side — label, dot, state, timestamp */}
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={Colors.accent} bold>
            KILL SWITCH
          </text>
          <StatusDot status={dotStatus} pulse={!engaged} />
          <text fg={stateColor} bold>
            {stateLabel}
          </text>
          {status && (
            <text fg={Colors.muted} dim>
              @ {formatKillSwitchTime(status.timestamp)}
            </text>
          )}
          {error && (
            <text fg={Colors.error} dim>
              ! {error.length > 40 ? error.slice(0, 37) + "…" : error}
            </text>
          )}
        </box>

        {/* Action side — engage / release buttons + refresh */}
        <box flexDirection="row" gap={2}>
          <text
            fg={Colors.muted}
            bg={Colors.card}
            onMouseUp={loading ? undefined : () => void refresh()}
          >
            {loading ? " ..." : " [REFRESH] "}
          </text>
          <text
            fg={engageDisabled ? Colors.muted : Colors.error}
            bg={engageDisabled ? undefined : Colors.card}
            dim={engageDisabled}
            onMouseUp={engageDisabled ? undefined : () => void setEngaged(true)}
          >
            {"  ENGAGE  "}
          </text>
          <text
            fg={releaseDisabled ? Colors.muted : Colors.success}
            bg={releaseDisabled ? undefined : Colors.card}
            dim={releaseDisabled}
            onMouseUp={
              releaseDisabled ? undefined : () => void setEngaged(false)
            }
          >
            {"  RELEASE  "}
          </text>
        </box>
      </box>
    </Panel>
  );
}

// ─── Main ServiceManager View ───────────────────────────────────────────────

export function ServiceManager({ dialog }: ServiceManagerProps) {
  // Subscribe to workers from the service store
  const workers = useServiceStore((s) => s.workers);
  const connectionStatus = useServiceStore((s) => s.connectionStatus);

  // Deploy/restart tracking state
  const [deployingWorker, setDeployingWorker] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState("");

  // Edge count from worker telemetry only — never invent a marketing "275+".
  const totalEdgeCount = workers.reduce((sum, w) => sum + w.edgeCount, 0);
  const displayEdgeCount = totalEdgeCount;
  const showPlus = false;

  /** Shared progress callback */
  const onProgress = useCallback((chunk: string) => {
    setDeployProgress((prev) => (prev + chunk).slice(-2000));
  }, []);

  /** Alert helper */
  const addResultAlert = useCallback(
    (
      id: string,
      type: string,
      result: CliResult,
      successMsg: string,
      failMsg: string
    ) => {
      const store = useServiceStore.getState();
      store.addAlert({
        id,
        type,
        severity: result.success ? "info" : "warning",
        message: result.success ? successMsg : failMsg,
        timestamp: Date.now(),
        acknowledged: false,
      });
    },
    []
  );

  // ── Per-worker action handlers ─────────────────────────────────────────
  const handleDeploy = async (worker: WorkerInfo) => {
    if (!dialog || deployingWorker) return;
    const confirmed = await showConfirm(dialog, {
      title: `Deploy ${worker.name}`,
      message: `Trigger a new deployment for ${worker.name}? This will publish the latest code bundle to Cloudflare.`,
      confirmLabel: "Deploy",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    setDeployingWorker(worker.name);
    setDeployProgress("");
    try {
      const result = await cliBridge.deployWorker(worker.name, onProgress);
      addResultAlert(
        `deploy-${Date.now()}-${worker.name}`,
        "deploy",
        result,
        `${worker.name} deployed (${(result.duration / 1000).toFixed(1)}s)`,
        `${worker.name} deploy failed: ${result.stderr || result.stdout || "unknown error"}`
      );
      if (result.success) await useServiceStore.getState().fetchWorkers();
    } catch (err) {
      useServiceStore.getState().addAlert({
        id: `deploy-err-${Date.now()}`,
        type: "deploy",
        severity: "error",
        message: `${worker.name} deploy error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } finally {
      setDeployingWorker(null);
    }
  };

  const handleRestart = async (worker: WorkerInfo) => {
    if (!dialog || deployingWorker) return;
    const confirmed = await showConfirm(dialog, {
      title: `Restart ${worker.name}`,
      message: `Restart the ${worker.name} worker? Running tasks will be gracefully drained before restart.`,
      confirmLabel: "Restart",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    setDeployingWorker(worker.name);
    setDeployProgress("");
    try {
      const result = await cliBridge.repairWorker(worker.name, onProgress);
      addResultAlert(
        `restart-${Date.now()}-${worker.name}`,
        "restart",
        result,
        `${worker.name} restarted (${(result.duration / 1000).toFixed(1)}s)`,
        `${worker.name} restart failed: ${result.stderr || result.stdout || "unknown error"}`
      );
      if (result.success) await useServiceStore.getState().fetchWorkers();
    } catch (err) {
      useServiceStore.getState().addAlert({
        id: `restart-err-${Date.now()}`,
        type: "restart",
        severity: "error",
        message: `${worker.name} restart error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } finally {
      setDeployingWorker(null);
    }
  };

  const handleDeployAll = async () => {
    if (!dialog || deployingWorker) return;
    const confirmed = await showConfirm(dialog, {
      title: "Deploy All Workers",
      message: `This will deploy the latest code to all ${workers.length} workers. Existing deployments will be replaced. Continue?`,
      confirmLabel: "Deploy All",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    setDeployingWorker("all");
    setDeployProgress("");
    try {
      const result = await cliBridge.deployAll(onProgress);
      addResultAlert(
        `deploy-all-${Date.now()}`,
        "deploy",
        result,
        `All deployed (${(result.duration / 1000).toFixed(1)}s)`,
        `Deploy all failed: ${result.stderr || result.stdout || "unknown error"}`
      );
      if (result.success) await useServiceStore.getState().fetchWorkers();
    } catch (err) {
      useServiceStore.getState().addAlert({
        id: `deploy-all-err-${Date.now()}`,
        type: "deploy",
        severity: "error",
        message: `Deploy all error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } finally {
      setDeployingWorker(null);
    }
  };

  const handleRestartAll = async () => {
    if (!dialog || deployingWorker) return;
    const confirmed = await showConfirm(dialog, {
      title: "Restart All Workers",
      message: `This will restart all ${workers.length} workers. Active trades will be gracefully drained. Continue?`,
      confirmLabel: "Restart All",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    setDeployingWorker("all");
    setDeployProgress("");
    try {
      const result = await cliBridge.rebuild(onProgress);
      addResultAlert(
        `restart-all-${Date.now()}`,
        "restart",
        result,
        `All restarted (${(result.duration / 1000).toFixed(1)}s)`,
        `Restart all failed: ${result.stderr || result.stdout || "unknown error"}`
      );
      if (result.success) await useServiceStore.getState().fetchWorkers();
    } catch (err) {
      useServiceStore.getState().addAlert({
        id: `restart-all-err-${Date.now()}`,
        type: "restart",
        severity: "error",
        message: `Restart all error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } finally {
      setDeployingWorker(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary viewName="Service Manager">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        {/* Header row */}
        <ViewHeader
          title="SERVICE MANAGER"
          showDivider={false}
          meta={
            <box flexDirection="row" gap={1}>
              <text fg={Colors.info}>Edges:</text>
              <text fg={Colors.accent} bold>
                {displayEdgeCount > 0 ? String(displayEdgeCount) : "—"}
                {showPlus ? "+" : ""}
              </text>
              <text
                fg={
                  ConnectionStatusColor[
                    connectionStatus as keyof typeof ConnectionStatusColor
                  ] ?? Colors.muted
                }
              >
                {connectionStatus === "connected"
                  ? "█"
                  : connectionStatus === "reconnecting"
                    ? "▌"
                    : connectionStatus === "polling"
                      ? "▌"
                      : "░"}
              </text>
            </box>
          }
        />

        {/* Main content: workers (left) + edge map (right) */}
        <box flexDirection="row" flexGrow={1} gap={1}>
          {/* Left: worker control list */}
          <Panel width="50%" flexGrow={1} elevated={false} compact>
            <WorkerControlList
              workers={workers}
              onDeploy={handleDeploy}
              onRestart={handleRestart}
              deployingWorker={deployingWorker}
            />
          </Panel>

          {/* Right: edge location map */}
          <Panel width="50%" flexGrow={1} elevated={false} compact>
            <EdgeMap />
          </Panel>
        </box>

        {/* Bottom: bulk actions bar */}
        <BulkActions
          workers={workers}
          onDeployAll={handleDeployAll}
          onRestartAll={handleRestartAll}
          deployingWorker={deployingWorker}
        />

        {/* Trading safety: kill-switch control */}
        <KillSwitchSection dialog={dialog} onAlert={addResultAlert} />

        {/* Deploy progress text */}
        {deployingWorker && (
          <box flexDirection="column" gap={0} paddingLeft={1}>
            <text fg={Colors.accent}>DEPLOYING {deployingWorker}...</text>
            {deployProgress && (
              <text fg={Colors.muted} dim>
                {deployProgress.slice(-200)}
              </text>
            )}
          </box>
        )}
      </box>
    </ErrorBoundary>
  );
}
