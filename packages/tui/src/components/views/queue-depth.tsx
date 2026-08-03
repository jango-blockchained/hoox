/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Queue Depth View — Real-time Cloudflare Queue backlog pressure dashboard.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │  QUEUE DEPTH              3 queues  ◉ 5s auto  │
 *   │─────────────────────────────────────────────────│
 *   │  SUMMARY   2 healthy · 0 backlogged · 0 crit    │
 *   │─────────────────────────────────────────────────│
 *   │  trade-queue          [█████████  ] 450 BACKLOG │
 *   │  notification-queue   [███       ] 100 OK       │
 *   │  analytics-queue      [░░░░░░░░░] 0   IDLE      │
 *   │─────────────────────────────────────────────────│
 *   │  [REFRESH]   Last sampled 12:34:56              │
 *   └─────────────────────────────────────────────────┘
 *
 * Pattern established for the TUI feature-parity batch:
 *   - Pure function component, no props required
 *   - Subscribes to useUIStore (so auto-refresh can pause when not active)
 *   - Calls cliBridge.monitorQueueDepth() on mount + every 5s while active
 *   - Wraps content in <ErrorBoundary viewName="Queue Depth">
 *   - Renders an empty/error state without throwing
 *
 * Color coding (delegated to Colors tokens):
 *   - healthy   → Colors.success  (green)
 *   - backlogged → Colors.warning (yellow)
 *   - critical  → Colors.error    (red)
 *   - paused    → Colors.muted    (gray)
 *   - unknown   → Colors.muted    (gray)
 */
import { useCallback, useEffect, useState } from "react";
import { Colors, useUIStore } from "@hoox-sh/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { Spinner, EmptyState } from "../shared/spinner";
import { ViewHeader } from "../shared/view-header";
import { Panel } from "../shared/panel";
import { cliBridge } from "../../services/cli-bridge";
import type { QueueDepth, QueueDepthStatus } from "../../services/cli-bridge";

/** Auto-refresh interval in milliseconds. */
const REFRESH_INTERVAL_MS = 5_000;

/** Width of the depth fill-bar (in terminal columns). */
const METER_WIDTH = 20;

/** Map a queue's status to a terminal color token. */
function statusColor(status: QueueDepthStatus): string {
  switch (status) {
    case "healthy":
      return Colors.success;
    case "backlogged":
      return Colors.warning;
    case "critical":
      return Colors.error;
    case "paused":
      return Colors.muted;
    case "unknown":
      return Colors.muted;
  }
}

/** Short status label suitable for inline display (≤ 8 chars). */
function statusLabel(status: QueueDepthStatus): string {
  switch (status) {
    case "healthy":
      return "OK";
    case "backlogged":
      return "BACKLOG";
    case "critical":
      return "CRITICAL";
    case "paused":
      return "PAUSED";
    case "unknown":
      return "UNKNOWN";
  }
}

/** Build a horizontal fill-bar like "████████░░░░░░░░░░░░". */
function buildMeter(filled: number, total: number): string {
  if (total <= 0) return "·".repeat(METER_WIDTH);
  const ratio = Math.max(0, Math.min(1, filled / total));
  const fillCount = Math.round(ratio * METER_WIDTH);
  const emptyCount = METER_WIDTH - fillCount;
  return "█".repeat(fillCount) + "░".repeat(emptyCount);
}

/** Format an ISO timestamp as HH:MM:SS for the "last sampled" footer. */
function formatTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ─── Sub-component: Single Queue Row ─────────────────────────────────────────

interface QueueRowProps {
  queue: QueueDepth;
}

function QueueRow({ queue }: QueueRowProps) {
  const color = statusColor(queue.status);
  const label = statusLabel(queue.status);
  const meter = buildMeter(queue.depth, queue.max);
  const pct = queue.max > 0 ? Math.round((queue.depth / queue.max) * 100) : 0;

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingLeft={1}
      paddingRight={1}
      alignItems="center"
    >
      {/* Queue name (fixed-width feel via uppercase + truncation in caller) */}
      <text fg={Colors.foreground} bold>
        {queue.queueName}
      </text>

      {/* Fill-bar meter */}
      <text fg={color}>{meter}</text>

      {/* Numeric depth + percentage */}
      <text fg={color}>
        {String(queue.depth).padStart(4, " ")} ({pct}%)
      </text>

      {/* Status pill */}
      <text fg={color} bold>
        {label}
      </text>

      {/* Producer/consumer counts (informational) */}
      <text fg={Colors.muted} dim>
        ↑{queue.producers} ↓{queue.consumers}
      </text>
    </box>
  );
}

// ─── Sub-component: Summary Bar ──────────────────────────────────────────────

interface SummaryBarProps {
  queues: QueueDepth[];
}

function SummaryBar({ queues }: SummaryBarProps) {
  const healthy = queues.filter((q) => q.status === "healthy").length;
  const backlogged = queues.filter((q) => q.status === "backlogged").length;
  const critical = queues.filter((q) => q.status === "critical").length;
  const paused = queues.filter((q) => q.status === "paused").length;

  return (
    <Panel elevated={false} compact>
      <box flexDirection="row" gap={2}>
        <text fg={Colors.muted} dim>
          SUMMARY
        </text>
        <text fg={Colors.success}>{healthy} healthy</text>
        <text fg={Colors.muted}>·</text>
        <text fg={Colors.warning}>{backlogged} backlogged</text>
        <text fg={Colors.muted}>·</text>
        <text fg={Colors.error}>{critical} critical</text>
        <text fg={Colors.muted}>·</text>
        <text fg={Colors.muted}>{paused} paused</text>
      </box>
    </Panel>
  );
}

// ─── Main QueueDepth View ────────────────────────────────────────────────────

/**
 * QueueDepth — Main view showing Cloudflare Queue backlog pressure.
 *
 * Pattern for subsequent TUI parity views (04, 05, 06, 08):
 *   1. Pure function component, no required props
 *   2. Subscribes to `useUIStore.activeView` to pause auto-refresh
 *      when the user navigates away
 *   3. Calls a `cliBridge.<method>()` on mount + on a fixed interval
 *      (5s here) — refreshes can be triggered manually via a button
 *   4. Renders an explicit empty/error state instead of throwing
 *   5. Wraps in <ErrorBoundary viewName="..."> so a render bug in
 *      one view never crashes the whole TUI
 */
export function QueueDepthView() {
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "queue-depth";

  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSampledAt, setLastSampledAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await cliBridge.monitorQueueDepth();
    if (result.success && result.data) {
      setQueues(result.data);
      setLastSampledAt(new Date().toISOString());
      setError(null);
    } else {
      // Keep previous data on transient failure but surface the message.
      setError(result.stderr || result.stdout || "Failed to read queue depths");
    }
    setLoading(false);
  }, []);

  // Initial load on mount
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      const result = await cliBridge.monitorQueueDepth();
      if (cancelled) return;
      if (result.success && result.data) {
        setQueues(result.data);
        setLastSampledAt(new Date().toISOString());
      } else {
        setError(
          result.stderr || result.stdout || "Failed to read queue depths"
        );
      }
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-refresh every 5s while the view is the active view.
  // We re-create the interval when `isActive` flips so navigation
  // away from the view stops the polling.
  useEffect(() => {
    if (!isActive) return;
    const handle = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [isActive, refresh]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary viewName="Queue Depth">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        <ViewHeader
          title="QUEUE DEPTH"
          showDivider={false}
          meta={
            <box flexDirection="row" gap={2} alignItems="center">
              <text fg={Colors.warning} dim>
                estimate · not live backlog
              </text>
              <text fg={Colors.muted} dim>
                {queues.length} queue{queues.length === 1 ? "" : "s"}
              </text>
              <text fg={Colors.info} dim>
                ◉ {REFRESH_INTERVAL_MS / 1000}s auto
              </text>
            </box>
          }
        />

        <text fg={Colors.muted} dim>
          Depth is a producer-count heuristic (Cloudflare Queues do not expose
          real-time backlog). Treat green/yellow/red as pressure guidance only.
        </text>

        {/* Summary bar */}
        <SummaryBar queues={queues} />

        {/* Queue list */}
        <Panel flexGrow={1} elevated={false} compact>
          {loading && queues.length === 0 ? (
            <box
              padding={1}
              alignItems="center"
              justifyContent="center"
              flexGrow={1}
            >
              <Spinner label="Loading queue depths..." />
            </box>
          ) : error && queues.length === 0 ? (
            <box padding={1} flexDirection="column" gap={0}>
              <text fg={Colors.error} bold>
                ! {error.length > 60 ? error.slice(0, 57) + "…" : error}
              </text>
              <text fg={Colors.muted} dim>
                Make sure wrangler is installed and authenticated.
              </text>
            </box>
          ) : queues.length === 0 ? (
            <box padding={1} flexGrow={1}>
              <EmptyState
                message="No queues configured."
                suggestion="Create one with `wrangler queues create`."
                icon="📥"
              />
            </box>
          ) : (
            <scrollbox width="100%" flexGrow={1}>
              {queues.map((q) => (
                <QueueRow key={q.queueName} queue={q} />
              ))}
            </scrollbox>
          )}
        </Panel>

        {/* Footer with refresh + last sampled timestamp */}
        <box
          flexDirection="row"
          justifyContent="space-between"
          paddingLeft={1}
          paddingRight={1}
        >
          <box flexDirection="row" gap={1}>
            <text
              fg={loading ? Colors.muted : Colors.accent}
              bg={Colors.card}
              dim={loading}
              onMouseUp={loading ? undefined : () => void refresh()}
            >
              {loading ? " ... " : " [REFRESH] "}
            </text>
            {error && queues.length > 0 && (
              <text fg={Colors.warning} dim>
                ! {error.length > 50 ? error.slice(0, 47) + "…" : error}
              </text>
            )}
          </box>
          <text fg={Colors.muted} dim>
            Last sampled {lastSampledAt ? formatTime(lastSampledAt) : "—"}
          </text>
        </box>
      </box>
    </ErrorBoundary>
  );
}
