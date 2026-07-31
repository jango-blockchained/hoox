"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, TrendingDown, RefreshCw, ChartLine } from "lucide-react";
import { api, type Position } from "@/lib/api";
import { cn } from "@/lib/utils";

type Period = "1D" | "1W" | "1M" | "1Y";

interface PnlPoint {
  date: string;
  pnl: number;
  label: string;
}

const chartConfig = {
  pnl: {
    label: "Unrealized PnL",
    color: "var(--color-chart-1)",
  },
};

const PERIODS: Period[] = ["1D", "1W", "1M", "1Y"];

function readNum(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function readStr(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function normalizePositions(positions: Position[]): {
  symbol: string;
  pnl: number;
  side: string;
}[] {
  return positions.map((raw) => {
    const p = raw as unknown as Record<string, unknown>;
    return {
      symbol: readStr(p, "symbol") ?? String(p.id ?? "—"),
      pnl: readNum(p, "unrealizedPnl", "unrealized_pnl", "pnl") ?? 0,
      side: (readStr(p, "side") ?? "LONG").toUpperCase(),
    };
  });
}

/** Build a ranked snapshot series from live positions — not historical equity.
 *  Used only when open positions exist so the chart isn't empty fake noise. */
function buildSnapshotSeries(
  positions: { symbol: string; pnl: number }[]
): PnlPoint[] {
  if (positions.length === 0) return [];

  const sorted = [...positions].sort((a, b) => b.pnl - a.pnl);
  let cumulative = 0;
  return sorted.map((pos) => {
    cumulative += pos.pnl;
    return {
      date: pos.symbol.replace(/\/USDT$/i, "").slice(0, 10),
      label: pos.symbol,
      pnl: Math.round(cumulative * 100) / 100,
    };
  });
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const body =
    abs >= 1000
      ? `${(abs / 1000).toFixed(1)}k`
      : abs.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
  return `${value < 0 ? "-" : ""}$${body}`;
}

function PnlChartSkeleton() {
  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <Skeleton key={p} className="h-7 w-9" />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[220px] w-full rounded-lg" />
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-10" />
              <Skeleton className="mt-2 h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PnlChart() {
  const [period, setPeriod] = useState<Period>("1M");
  const [data, setData] = useState<PnlPoint[]>([]);
  const [totalUnrealized, setTotalUnrealized] = useState(0);
  const [positionCount, setPositionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHistory, setHasHistory] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // Prefer live positions for mark-to-market snapshot.
      // No historical equity endpoint exists yet — avoid inventing series.
      const positionsRes = await api.getPositions();
      if (!positionsRes.success) {
        throw new Error("Positions API returned unsuccessful response");
      }

      const normalized = normalizePositions(positionsRes.positions ?? []);
      const open = normalized; // endpoint already filters OPEN
      const total = open.reduce((s, p) => s + p.pnl, 0);
      setTotalUnrealized(total);
      setPositionCount(open.length);
      setData(buildSnapshotSeries(open));
      setHasHistory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PnL data");
      setData([]);
      setPositionCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Period controls reserved for when historical equity lands; they still
  // re-filter the snapshot presentation (label density only).
  const displayData = useMemo(() => {
    if (data.length === 0) return data;
    if (period === "1D" && data.length > 8) return data.slice(0, 8);
    return data;
  }, [data, period]);

  const isPositive = totalUnrealized >= 0;
  const maxPnl =
    displayData.length > 0 ? Math.max(...displayData.map((d) => d.pnl)) : 0;
  const minPnl =
    displayData.length > 0 ? Math.min(...displayData.map((d) => d.pnl)) : 0;
  const winners = displayData.filter((d, i, arr) => {
    const prev = i === 0 ? 0 : arr[i - 1].pnl;
    return d.pnl - prev > 0;
  }).length;

  if (loading) {
    return <PnlChartSkeleton />;
  }

  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <CardDescription className="text-xs">
              {hasHistory
                ? "Cumulative equity"
                : "Mark-to-market by open position"}
            </CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "gap-1",
              isPositive ? "text-success" : "text-destructive"
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" aria-hidden />
            ) : (
              <TrendingDown className="h-3 w-3" aria-hidden />
            )}
            {isPositive ? "+" : ""}
            {totalUnrealized.toLocaleString(undefined, {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 2,
            })}
          </Badge>
        </div>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Time range"
        >
          {PERIODS.map((p) => (
            <Button
              key={p}
              variant={period === p ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              disabled={!hasHistory}
              title={
                hasHistory
                  ? `Show ${p}`
                  : "Historical ranges unlock when equity history is available"
              }
            >
              {p}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh performance chart"
          >
            <RefreshCw
              className={cn(
                "size-3.5 text-muted-foreground",
                refreshing && "animate-spin"
              )}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div
            className="flex h-[220px] flex-col items-center justify-center gap-3 text-center"
            role="alert"
          >
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : positionCount === 0 || displayData.length === 0 ? (
          <Empty className="h-[220px] border-0 py-8 md:py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartLine className="text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No open exposure</EmptyTitle>
              <EmptyDescription className="max-w-xs text-xs">
                Unrealized PnL appears when positions are open. Historical
                equity curves require a trade-history series (not yet exposed).
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/positions">View positions</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="h-[220px] w-full"
              role="img"
              aria-label={`Unrealized PnL snapshot across ${positionCount} open positions. Total ${totalUnrealized.toFixed(2)} USD.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={displayData}
                  margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="pnlGradientPositive"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-success)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-success)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient
                      id="pnlGradientNegative"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-destructive)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-destructive)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fill: "var(--color-muted-foreground)",
                      fontSize: 10,
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fill: "var(--color-muted-foreground)",
                      fontSize: 10,
                    }}
                    tickFormatter={(value: number) => formatUsd(value)}
                    width={52}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="var(--color-muted-foreground)"
                    strokeDasharray="3 3"
                  />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        labelKey="label"
                        formatter={(value) => {
                          const num =
                            typeof value === "number" ? value : Number(value);
                          return (
                            <span className="font-mono font-medium">
                              {Number.isFinite(num)
                                ? num.toLocaleString(undefined, {
                                    style: "currency",
                                    currency: "USD",
                                  })
                                : "—"}
                            </span>
                          );
                        }}
                      />
                    }
                    cursor={{
                      stroke: "var(--color-primary)",
                      strokeWidth: 1,
                      strokeDasharray: "5 5",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pnl"
                    name="Cumulative uPnL"
                    stroke={
                      isPositive
                        ? "var(--color-success)"
                        : "var(--color-destructive)"
                    }
                    strokeWidth={2}
                    fill={
                      isPositive
                        ? "url(#pnlGradientPositive)"
                        : "url(#pnlGradientNegative)"
                    }
                    animationDuration={500}
                    isAnimationActive
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  High
                </p>
                <p className="text-sm font-medium text-success tabular-nums">
                  {formatUsd(maxPnl)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Low
                </p>
                <p className="text-sm font-medium text-destructive tabular-nums">
                  {formatUsd(minPnl)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Positions
                </p>
                <p className="text-sm font-medium text-foreground tabular-nums">
                  {positionCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Contributing
                </p>
                <p
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    isPositive ? "text-success" : "text-destructive"
                  )}
                >
                  {winners}/{positionCount}
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
