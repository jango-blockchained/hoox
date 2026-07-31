"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUp, ArrowDown, Info, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { api, type Position } from "@/lib/api";
import { HooxIcon } from "@/components/ui/hoox-icon";
import { cn } from "@/lib/utils";

interface MetricData {
  id: string;
  title: string;
  value: number;
  displayValue: string;
  suffix?: string;
  description: string;
  tooltip: string;
  icon: "activity" | "trendUp" | "wallet" | "chart";
  trend: string | null;
  trendUp: boolean | null;
  valueClassName?: string;
}

type LoadState = "loading" | "ready" | "error";

/** Defensive read — d1-worker returns activePositionsCount / numeric winRate;
 *  the typed client historically expected openPositions / string winRate. */
function normalizeStats(raw: Record<string, unknown>): {
  totalTrades: number;
  openPositions: number;
  winRate: number | null;
  winRateLabel: string;
  dailyTrades: number;
  totalPnlUSDT: number;
} {
  const totalTrades = Number(raw.totalTrades ?? 0) || 0;
  const openPositions =
    Number(raw.openPositions ?? raw.activePositionsCount ?? 0) || 0;
  const dailyTrades = Number(raw.dailyTradesCount ?? 0) || 0;
  const totalPnlUSDT = Number(raw.totalPnlUSDT ?? 0) || 0;

  const winRaw = raw.winRate;
  if (winRaw === "N/A" || winRaw === null || winRaw === undefined) {
    return {
      totalTrades,
      openPositions,
      winRate: null,
      winRateLabel: "N/A",
      dailyTrades,
      totalPnlUSDT,
    };
  }
  const winRate =
    typeof winRaw === "number"
      ? winRaw
      : typeof winRaw === "string"
        ? Number.parseFloat(winRaw)
        : NaN;
  if (!Number.isFinite(winRate)) {
    return {
      totalTrades,
      openPositions,
      winRate: null,
      winRateLabel: "N/A",
      dailyTrades,
      totalPnlUSDT,
    };
  }
  return {
    totalTrades,
    openPositions,
    winRate,
    winRateLabel: String(winRate),
    dailyTrades,
    totalPnlUSDT,
  };
}

function readPositionPnl(position: Position | Record<string, unknown>): number {
  const p = position as Record<string, unknown>;
  const candidates = [p.unrealizedPnl, p.unrealized_pnl, p.pnl];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return 0;
}

function formatPnl(value: number): string {
  const abs = Math.abs(value);
  const formatted =
    abs >= 1000
      ? abs.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : abs.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return `${value >= 0 ? "+" : "-"}$${formatted}`;
}

function AnimatedNumber({
  value,
  suffix = "",
  formatAsCurrency = false,
}: {
  value: number;
  suffix?: string;
  formatAsCurrency?: boolean;
}) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const startValue = displayValue;
    const endValue = value;
    const duration = 500;
    const startTime = Date.now();
    let rafId: number;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;
      setDisplayValue(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
    // Intentionally only re-run when `value` changes (start from last displayed)
  }, [value]);

  const display = (() => {
    if (formatAsCurrency) {
      return formatPnl(displayValue);
    }
    if (Math.abs(displayValue) >= 1000) {
      return (
        displayValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) +
        suffix
      );
    }
    if (suffix === "%" && Math.abs(displayValue) < 100) {
      return displayValue.toFixed(1) + suffix;
    }
    if (Math.abs(displayValue) < 10 && suffix === "%") {
      return displayValue.toFixed(1) + suffix;
    }
    return Math.round(displayValue).toLocaleString() + suffix;
  })();

  return (
    <motion.span
      key={value}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.03, 1] }}
      transition={{ duration: 0.25 }}
    >
      {display}
    </motion.span>
  );
}

function SparkLine({ data, positive }: { data: number[]; positive: boolean }) {
  const hasSignal =
    data.length >= 2 && data.some((v, i, a) => i > 0 && v !== a[0]);
  const max = hasSignal ? Math.max(...data) : 0;
  const min = hasSignal ? Math.min(...data) : 0;
  const range = max - min || 1;

  const points = useMemo(() => {
    if (!hasSignal) return "";
    return data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * 60;
        const y = 20 - ((value - min) / range) * 16;
        return `${x},${y}`;
      })
      .join(" ");
  }, [data, hasSignal, min, range]);

  if (!hasSignal) {
    return (
      <svg
        className="h-5 w-15 text-muted-foreground/40"
        viewBox="0 0 60 24"
        aria-hidden
      >
        <line
          x1="0"
          y1="12"
          x2="60"
          y2="12"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  return (
    <svg className="h-5 w-15" viewBox="0 0 60 24" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "var(--color-success)" : "var(--color-destructive)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetricsSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Loading portfolio metrics"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <Card
          key={i}
          className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <Skeleton className="mt-3 h-9 w-28" />
            <div className="mt-3 flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-15" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MetricsCards() {
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const sparkData = useMemo(
    () =>
      Object.fromEntries(
        metrics.map((m) => [m.id, [0, 0, 0, 0, 0, 0, 0]])
      ) as Record<string, number[]>,
    [metrics]
  );

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) {
      setRefreshing(true);
    } else {
      setState("loading");
    }
    setErrorMessage(null);

    try {
      const [statsRes, positionsRes] = await Promise.all([
        api.getStats(),
        api
          .getPositions()
          .catch(() => ({ success: false, positions: [] as Position[] })),
      ]);

      if (!statsRes.success || !statsRes.stats) {
        throw new Error("Stats endpoint returned no data");
      }

      const stats = normalizeStats(
        statsRes.stats as unknown as Record<string, unknown>
      );
      const positions = positionsRes.success
        ? (positionsRes.positions ?? [])
        : [];
      const openLive = positions.filter((p) => {
        const status = String(
          (p as Position).status ??
            (p as unknown as Record<string, unknown>).status ??
            "OPEN"
        ).toUpperCase();
        return status === "OPEN";
      });
      const unrealized = openLive.reduce(
        (sum, p) => sum + readPositionPnl(p),
        0
      );
      const openCount =
        openLive.length > 0 ? openLive.length : stats.openPositions;

      const next: MetricData[] = [
        {
          id: "trades",
          title: "Total Trades",
          value: stats.totalTrades,
          displayValue: String(stats.totalTrades),
          description: "Lifetime fills",
          tooltip:
            "Count of executed trades recorded in the ledger (excludes testnet fills).",
          icon: "activity",
          trend:
            stats.dailyTrades > 0
              ? `+${stats.dailyTrades} today`
              : stats.dailyTrades === 0
                ? "0 today"
                : null,
          trendUp: stats.dailyTrades > 0 ? true : null,
        },
        {
          id: "winrate",
          title: "Win Rate",
          value: stats.winRate ?? 0,
          displayValue: stats.winRateLabel,
          suffix: stats.winRate === null ? undefined : "%",
          description: "Closed positions",
          tooltip:
            "Share of closed live positions with positive realized PnL. Shows N/A when no closed trades exist.",
          icon: "trendUp",
          trend:
            stats.winRate === null
              ? null
              : stats.winRate >= 50
                ? "Above break-even"
                : "Below break-even",
          trendUp: stats.winRate === null ? null : stats.winRate >= 50,
        },
        {
          id: "positions",
          title: "Open Positions",
          value: openCount,
          displayValue: String(openCount),
          description: "Active exposure",
          tooltip:
            "Live open positions currently tracked by the portfolio ledger.",
          icon: "wallet",
          trend: openCount > 0 ? "In market" : "Flat",
          trendUp: openCount > 0 ? true : null,
        },
        {
          id: "upnl",
          title: "Unrealized PnL",
          value: unrealized,
          displayValue: formatPnl(unrealized),
          description: "Mark-to-market",
          tooltip:
            "Sum of unrealized PnL across open positions. Historical equity curves require trade history.",
          icon: "chart",
          trend: openCount === 0 ? "No exposure" : null,
          trendUp: unrealized >= 0,
          valueClassName:
            unrealized > 0
              ? "text-success"
              : unrealized < 0
                ? "text-destructive"
                : undefined,
        },
      ];

      setMetrics(next);
      setLastUpdated(new Date());
      setState("ready");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load metrics"
      );
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load({ soft: true }), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (state === "loading" && metrics.length === 0) {
    return <MetricsSkeleton />;
  }

  if (state === "error" && metrics.length === 0) {
    return (
      <Card className="border-border bg-card" role="alert">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm font-medium text-foreground">
              Could not load portfolio metrics
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {errorMessage ?? "Check d1-worker connectivity and auth keys."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            className="gap-2"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void load({ soft: true })}
            disabled={refreshing}
            aria-label="Refresh metrics"
          >
            <RefreshCw
              className={cn(
                "size-3.5 text-muted-foreground",
                refreshing && "animate-spin"
              )}
            />
          </Button>
        </div>

        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          role="region"
          aria-label="Portfolio metrics"
        >
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                ease: "easeOut",
                delay: index * 0.06,
              }}
            >
              <Card className="group relative overflow-hidden border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <CardContent className="relative p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {metric.title}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-sm text-muted-foreground/70 outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`About ${metric.title}`}
                          >
                            <Info className="size-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px]">
                          {metric.tooltip}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-secondary/50 transition-colors group-hover:bg-primary/10">
                      <HooxIcon
                        name={metric.icon}
                        size="sm"
                        className="text-muted-foreground transition-colors group-hover:text-primary"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span
                      className={cn(
                        "text-3xl font-bold tracking-tight text-foreground",
                        metric.valueClassName
                      )}
                    >
                      {metric.id === "upnl" ? (
                        <AnimatedNumber value={metric.value} formatAsCurrency />
                      ) : metric.id === "winrate" &&
                        metric.displayValue === "N/A" ? (
                        "N/A"
                      ) : (
                        <AnimatedNumber
                          value={metric.value}
                          suffix={metric.suffix}
                        />
                      )}
                    </span>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {metric.description}
                        </span>
                        {metric.trend && (
                          <span
                            className={cn(
                              "flex items-center gap-0.5 text-xs font-medium",
                              metric.trendUp === true && "text-success",
                              metric.trendUp === false && "text-destructive",
                              metric.trendUp === null && "text-muted-foreground"
                            )}
                          >
                            {metric.trendUp === true && (
                              <ArrowUp className="size-3" aria-hidden />
                            )}
                            {metric.trendUp === false && (
                              <ArrowDown className="size-3" aria-hidden />
                            )}
                            {metric.trend}
                          </span>
                        )}
                      </div>
                      <SparkLine
                        data={sparkData[metric.id] || []}
                        positive={metric.trendUp ?? true}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
