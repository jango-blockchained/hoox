/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Trade Monitor View — live trade feed, open positions, and performance summary.
 *
 * Layout (3-panel):
 *   1. Header: "TRADE MONITOR" title + [LIVE]/[PAUSED] indicator + trade count
 *   2. Left panel (LiveTradeFeed): scrollable ring buffer, newest first
 *      - BUY  → green  (Colors.success)  | SELL → red    (Colors.error)
 *      - Each row: timestamp, side, symbol, quantity, price, exchange, latency ms
 *   3. Right panels (stacked):
 *      a. OpenPositions: derived from trades by symbol with P&L, total P&L header
 *      b. PerformanceSummary: Today/Week/Month P&L, WinRate%, Sharpe ratio
 *
 * Space toggles pause/resume of the live feed. Feed capped at 500 via store ring buffer.
 *
 * Follows Pattern 1 (View Composition), Pattern 2 (Store Subscription).
 * Colors from @jango-blockchained/hoox-shared design tokens. No CSS, no DOM.
 */
import { useState, useMemo, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import { Colors, useServiceStore } from "@jango-blockchained/hoox-shared";
import type { Trade, TradeSide } from "@jango-blockchained/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { Spinner, EmptyState } from "../shared/spinner";
import { ViewHeader } from "../shared/view-header";
import { Panel } from "../shared/panel";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum trades rendered in the live feed display */
const MAX_VISIBLE_TRADES = 500;

/** Side-based display color tokens */
const SIDE_COLOR: Record<TradeSide, string> = {
  buy: Colors.success,
  sell: Colors.error,
};

/** Side label for display */
const SIDE_LABEL: Record<TradeSide, string> = {
  buy: "BUY ",
  sell: "SELL",
};

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format a timestamp (ms) to HH:MM:SS.
 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return [
    d.getHours().toString().padStart(2, "0"),
    d.getMinutes().toString().padStart(2, "0"),
    d.getSeconds().toString().padStart(2, "0"),
  ].join(":");
}

/**
 * Format a P&L value with +/- prefix.
 * Shows 2 decimal places only when the value has a fractional part.
 */
function formatPnL(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(value);
  const hasCents = abs !== Math.round(abs);
  const decimals = hasCents ? 2 : 0;
  return `${sign}${abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Format a ratio as a percentage string.
 */
function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a number with comma separators and optional decimals.
 */
function formatNum(value: number, decimals = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get Unix timestamp for midnight today (local time) */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Get Unix timestamp for N days ago at midnight */
function startOfDaysAgo(days: number): number {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Age of the trade event in ms (now − trade timestamp).
 * This is feed staleness, not exchange round-trip latency.
 * Returns null if trade is in the future (clock skew).
 */
function calcLatency(tradeTs: number): number | null {
  const now = Date.now();
  const latency = now - tradeTs;
  return latency >= 0 ? latency : null;
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

/**
 * TradeMonitorHeader — view title with paused/live indicator and trade count.
 */
function TradeMonitorHeader({
  paused,
  tradeCount,
}: {
  paused: boolean;
  tradeCount: number;
}) {
  return (
    <ViewHeader
      title="TRADE MONITOR"
      showDivider={false}
      meta={
        <box flexDirection="row" gap={2}>
          <box flexDirection="row" gap={1}>
            <text
              fg={paused ? Colors.warning : Colors.success}
              bold
              blink={!paused}
            >
              {paused ? "▌" : "█"}
            </text>
            <text fg={paused ? Colors.warning : Colors.success}>
              {paused ? "PAUSED" : "LIVE"}
            </text>
          </box>
          <text fg={Colors.muted} dim>
            {`${tradeCount} trades`}
          </text>
          <text fg={Colors.dim} dim>
            Space to {paused ? "resume" : "pause"}
          </text>
        </box>
      }
    />
  );
}

/**
 * LiveTradeFeed — scrollable list of trades, newest first.
 *
 * Each row shows:
 *   HH:MM:SS  BUY/SELL  SYMBOL  QTY @ $PRICE  EXCHANGE  ·  LATENCYms
 *
 * Buy trades colored green (Colors.success), sell trades red (Colors.error).
 * Selected row highlighted with accent border color and card background.
 * Feed is capped at the store's ring buffer size (500).
 */
function LiveTradeFeed({ paused }: { paused: boolean }) {
  const tradeStream = useServiceStore((s) => s.tradeStream);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Snapshot frozen trades when paused; keep updating otherwise
  const frozenRef = useRef<Trade[]>([]);
  const wasPausedRef = useRef(false);

  // Capture snapshot on pause edge, release on resume
  if (!paused && wasPausedRef.current) {
    frozenRef.current = [];
  }
  if (paused && !wasPausedRef.current) {
    frozenRef.current = [...tradeStream];
  }
  wasPausedRef.current = paused;

  // Use frozen snapshot when paused, live stream when not
  const effectiveStream = paused ? frozenRef.current : tradeStream;

  // Newest first, reversed (store stores newest last)
  const sortedTrades = useMemo(() => {
    return [...effectiveStream].reverse().slice(0, MAX_VISIBLE_TRADES);
  }, [effectiveStream]);

  const maxIndex = Math.max(0, sortedTrades.length - 1);

  // Clamp selected index when data changes
  const safeIndex = Math.min(selectedIndex, maxIndex);

  // Keyboard: navigate trade rows
  useKeyboard((key) => {
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.name === "down") {
      setSelectedIndex((i) => Math.min(maxIndex, i + 1));
    }
  });

  return (
    <Panel flexGrow={1} elevated={false} compact title="LIVE TRADE FEED">
      {paused ? (
        <text fg={Colors.warning} dim>
          PAUSED
        </text>
      ) : null}

      {/* Column header */}
      <box flexDirection="row" gap={1} paddingTop={0}>
        <text fg={Colors.muted} dim>
          TIME
        </text>
        <text fg={Colors.muted} dim>
          SIDE
        </text>
        <text fg={Colors.muted} dim>
          SYMBOL
        </text>
        <text fg={Colors.muted} dim>
          QTY @ PRICE
        </text>
        <text fg={Colors.muted} dim>
          EXCHANGE
        </text>
        <text fg={Colors.muted} dim>
          AGE
        </text>
      </box>

      {sortedTrades.length === 0 ? (
        <box
          paddingTop={1}
          alignItems="center"
          justifyContent="center"
          flexGrow={1}
        >
          <Spinner label="Waiting for live data..." />
        </box>
      ) : (
        <scrollbox
          width="100%"
          flexGrow={1}
          height={14}
          paddingX={1}
          paddingY={0}
        >
          {sortedTrades.map((trade, i) => {
            const color = SIDE_COLOR[trade.side];
            const label = SIDE_LABEL[trade.side];
            const latency = calcLatency(trade.timestamp);
            const isSelected = i === safeIndex;
            const latencyStr =
              latency !== null
                ? latency < 1000
                  ? `${latency}ms`
                  : `${(latency / 1000).toFixed(1)}s`
                : "—";

            return (
              <box
                key={trade.id}
                flexDirection="row"
                gap={1}
                backgroundColor={isSelected ? Colors.card : undefined}
              >
                {/* Timestamp */}
                <text fg={Colors.muted} dim selectable>
                  {formatTime(trade.timestamp)}
                </text>

                {/* Side — color-coded */}
                <text fg={color} bold selectable>
                  {label}
                </text>

                {/* Symbol */}
                <text
                  fg={isSelected ? Colors.accent : Colors.foreground}
                  bold={isSelected}
                  selectable
                >
                  {trade.symbol.padEnd(6)}
                </text>

                {/* Quantity @ Price */}
                <text fg={Colors.foreground} selectable>
                  {trade.quantity} @ ${formatNum(trade.price, 2)}
                </text>

                {/* Exchange */}
                <text fg={Colors.muted} dim selectable>
                  {trade.exchange}
                </text>

                {/* Latency */}
                <text
                  fg={
                    latency !== null && latency < 100
                      ? Colors.success
                      : latency !== null && latency < 500
                        ? Colors.warning
                        : Colors.muted
                  }
                  dim={latency === null || latency >= 500}
                  selectable
                >
                  · {latencyStr}
                </text>
              </box>
            );
          })}
        </scrollbox>
      )}

      {/* Scroll position hint */}
      {sortedTrades.length > 0 && (
        <text fg={Colors.dim} dim>
          ↑↓ navigate · {safeIndex + 1}/{sortedTrades.length}
        </text>
      )}
    </Panel>
  );
}

/**
 * SymbolPnlSummary — per-symbol P&L rolled up from the live trade stream.
 *
 * This is NOT exchange inventory / open-position state. It groups stream
 * trades by symbol and sums reported pnl. Labels in the UI say so explicitly.
 */
function OpenPositions() {
  const tradeStream = useServiceStore((s) => s.tradeStream);

  // Derive per-symbol P&L from stream (not real open positions)
  const positions = useMemo(() => {
    const map = new Map<
      string,
      { pnl: number; tradeCount: number; lastPrice: number; side: TradeSide }
    >();

    for (const trade of tradeStream) {
      const existing = map.get(trade.symbol);
      if (existing) {
        if (trade.pnl !== undefined) {
          existing.pnl += trade.pnl;
        }
        existing.tradeCount++;
        existing.lastPrice = trade.price;
        existing.side = trade.side;
      } else {
        map.set(trade.symbol, {
          pnl: trade.pnl ?? 0,
          tradeCount: 1,
          lastPrice: trade.price,
          side: trade.side,
        });
      }
    }

    // Convert to array, filter out zero-trade symbols, sort by abs P&L desc
    return Array.from(map.entries())
      .map(([symbol, data]) => ({ symbol, ...data }))
      .filter((p) => p.tradeCount > 0)
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  }, [tradeStream]);

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

  return (
    <Panel elevated={false} compact title="SYMBOL P&L">
      {/* Total P&L (stream rollup, not exchange inventory) */}
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={Colors.muted} dim>
          (stream)
        </text>
        <text fg={totalPnl >= 0 ? Colors.success : Colors.error} bold>
          {formatPnL(totalPnl)}
        </text>
      </box>

      {/* Column header */}
      <box flexDirection="row" gap={1} paddingTop={0}>
        <text fg={Colors.muted} dim>
          SYMBOL
        </text>
        <text fg={Colors.muted} dim>
          SIDE
        </text>
        <text fg={Colors.muted} dim>
          P&L
        </text>
      </box>

      {positions.length === 0 ? (
        <box paddingTop={1} flexGrow={1}>
          <EmptyState message="No stream P&L yet" icon="📊" />
        </box>
      ) : (
        <scrollbox
          width="100%"
          flexGrow={1}
          height={5}
          paddingX={1}
          paddingY={0}
        >
          {positions.map((pos) => (
            <box key={pos.symbol} flexDirection="row" gap={1}>
              {/* Symbol */}
              <text fg={Colors.foreground} bold>
                {pos.symbol.padEnd(6)}
              </text>

              {/* Side badge */}
              <text fg={SIDE_COLOR[pos.side]} bold>
                {SIDE_LABEL[pos.side]}
              </text>

              {/* P&L — green for profit, red for loss */}
              <text
                fg={pos.pnl >= 0 ? Colors.success : Colors.error}
                bold={Math.abs(pos.pnl) > 0}
              >
                {formatPnL(pos.pnl)}
              </text>
            </box>
          ))}
        </scrollbox>
      )}

      {/* Total row */}
      {positions.length > 0 && (
        <box flexDirection="row" gap={1} paddingTop={0}>
          <text fg={Colors.muted} dim>
            TOTAL
          </text>
          <text fg={totalPnl >= 0 ? Colors.success : Colors.error} bold>
            {formatPnL(totalPnl)}
          </text>
        </box>
      )}
    </Panel>
  );
}

/**
 * PerformanceSummary — key metrics panel.
 *
 * Shows:
 *   - Today P&L (trades since midnight)
 *   - Week P&L  (trades since 7 days ago)
 *   - Month P&L (trades since 30 days ago)
 *   - WinRate % (trades with positive pnl / trades with pnl data)
 *   - Sharpe ratio (calculated from trade returns when enough data)
 */
function PerformanceSummary() {
  const tradeStream = useServiceStore((s) => s.tradeStream);
  const metrics = useServiceStore((s) => s.metrics);

  const perf = useMemo(() => {
    const todayStart = startOfToday();
    const weekStart = startOfDaysAgo(7);
    const monthStart = startOfDaysAgo(30);

    let todayPnl = 0;
    let weekPnl = 0;
    let monthPnl = 0;
    let winCount = 0;
    let totalWithPnl = 0;

    for (const trade of tradeStream) {
      const pnl = trade.pnl ?? 0;
      if (trade.timestamp >= todayStart) todayPnl += pnl;
      if (trade.timestamp >= weekStart) weekPnl += pnl;
      if (trade.timestamp >= monthStart) monthPnl += pnl;

      if (trade.pnl !== undefined) {
        totalWithPnl++;
        if (trade.pnl > 0) winCount++;
      }
    }

    const winRate = totalWithPnl > 0 ? winCount / totalWithPnl : 0;

    // Sharpe ratio: (mean return / std deviation of returns) * sqrt(252)
    // Using trade pnl values as returns proxy, annualized
    let sharpe = 0;
    if (totalWithPnl >= 5) {
      const returns = tradeStream
        .filter((t) => t.pnl !== undefined)
        .map((t) => t.pnl!);
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance =
        returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0 && mean !== 0) {
        sharpe = (mean / stdDev) * Math.sqrt(252);
      }
    }

    return { todayPnl, weekPnl, monthPnl, winRate, sharpe, totalWithPnl };
  }, [tradeStream]);

  // Also show overall P&L from system metrics if available
  const overallPnl = metrics?.totalPnl;

  // Two metrics per row — Panel chrome costs height in the narrow right column.
  // Never nest <text> inside <text> (OpenTUI rule).
  const sharpeLabel = perf.totalWithPnl >= 5 ? perf.sharpe.toFixed(2) : "N/A";
  const sharpeColor =
    perf.totalWithPnl < 5
      ? Colors.muted
      : perf.sharpe >= 1
        ? Colors.success
        : perf.sharpe >= 0
          ? Colors.warning
          : Colors.error;

  return (
    <Panel elevated={false} compact title="PERFORMANCE">
      <box flexDirection="row" gap={1}>
        <text fg={Colors.muted} dim>
          Today
        </text>
        <text fg={perf.todayPnl >= 0 ? Colors.success : Colors.error} bold>
          {formatPnL(perf.todayPnl)}
        </text>
        <text fg={Colors.muted} dim>
          7-Day
        </text>
        <text fg={perf.weekPnl >= 0 ? Colors.success : Colors.error} bold>
          {formatPnL(perf.weekPnl)}
        </text>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg={Colors.muted} dim>
          30-Day
        </text>
        <text fg={perf.monthPnl >= 0 ? Colors.success : Colors.error} bold>
          {formatPnL(perf.monthPnl)}
        </text>
        <text fg={Colors.muted} dim>
          WinRate
        </text>
        <text fg={perf.winRate >= 0.5 ? Colors.success : Colors.warning} bold>
          {formatPct(perf.winRate)}
        </text>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg={Colors.muted} dim>
          Sharpe
        </text>
        <text
          fg={sharpeColor}
          bold={perf.totalWithPnl >= 5}
          dim={perf.totalWithPnl < 5}
        >
          {sharpeLabel}
        </text>
        {overallPnl !== undefined && overallPnl !== null ? (
          <>
            <text fg={Colors.muted} dim>
              Total P&L
            </text>
            <text fg={overallPnl >= 0 ? Colors.success : Colors.error} bold>
              {formatPnL(overallPnl)}
            </text>
          </>
        ) : null}
      </box>
      {tradeStream.length === 0 ? (
        <text fg={Colors.muted} dim>
          Awaiting trade data...
        </text>
      ) : null}
    </Panel>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

/**
 * TradeMonitor — full trade monitoring view.
 *
 * Composes: Header → [LiveTradeFeed | OpenPositions + PerformanceSummary]
 * Wrapped in an ErrorBoundary for crash recovery.
 *
 * Keyboard:
 *   Space  — toggle pause/resume of live feed
 *   ↑↓     — navigate trade rows in live feed
 *
 * View subscribes to service-store (tradeStream, metrics) and
 * re-renders on data changes via Zustand selectors.
 */
export function TradeMonitor() {
  const [paused, setPaused] = useState(false);
  const tradeStream = useServiceStore((s) => s.tradeStream);

  // Keyboard: space toggles pause/resume
  useKeyboard((key) => {
    if (key.name === "space") {
      setPaused((p) => !p);
    }
  });

  return (
    <ErrorBoundary viewName="Trade Monitor">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        {/* 1. Header */}
        <TradeMonitorHeader paused={paused} tradeCount={tradeStream.length} />

        {/* Divider */}
        <text fg={Colors.border} dim>
          {"─".repeat(78)}
        </text>

        {/* 2. Main panels: Feed (left) | Positions + Performance (right) */}
        <box flexDirection="row" flexGrow={1} gap={1}>
          {/* Left: Live Trade Feed */}
          <box flexDirection="column" flexGrow={1}>
            <LiveTradeFeed paused={paused} />
          </box>

          {/* Divider between panels */}
          <text fg={Colors.border} dim>
            │
          </text>

          {/* Right: Positions + Performance stacked */}
          <box flexDirection="column" width={34} gap={1}>
            {/* Open Positions */}
            <OpenPositions />

            {/* Section divider */}
            <text fg={Colors.dim} dim>
              {"─".repeat(32)}
            </text>

            {/* Performance Summary */}
            <PerformanceSummary />
          </box>
        </box>
      </box>
    </ErrorBoundary>
  );
}
