/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AnalyticsCard,
  AnalyticsCardSkeleton,
  AnalyticsEmpty,
  AnalyticsErrorState,
} from "./analytics-shell";
import {
  appendTimeRangeParams,
  timeRangeLabel,
  type TimeRangeKey,
} from "./time-range";
import { useAnalyticsQuery } from "./use-analytics-query";

const chartConfig = {
  success_count: {
    label: "Success",
    color: "var(--color-chart-2)",
  },
  failure_count: {
    label: "Failures",
    color: "var(--color-chart-5)",
  },
  trade_count: {
    label: "Total",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig;

interface TradeMetricsRow {
  exchange: string;
  trade_count: number;
  success_count: number;
  failure_count: number;
  avg_price?: number;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRows(rows: TradeMetricsRow[]): TradeMetricsRow[] {
  return rows
    .map((r) => ({
      exchange: String(r.exchange || "unknown"),
      trade_count: num(r.trade_count),
      success_count: num(r.success_count),
      failure_count: num(r.failure_count),
      avg_price: num(r.avg_price),
    }))
    .filter(
      (r) => r.trade_count > 0 || r.success_count > 0 || r.failure_count > 0
    )
    .sort((a, b) => b.trade_count - a.trade_count);
}

export function TradeMetricsChart({
  timeRange = "7d",
  className,
}: {
  timeRange?: TimeRangeKey;
  className?: string;
}) {
  const url = useMemo(() => {
    const u = new URL(
      "/api/analytics/trade-metrics",
      typeof window !== "undefined" ? window.location.origin : "http://local"
    );
    appendTimeRangeParams(u, timeRange);
    return u.pathname + u.search;
  }, [timeRange]);

  const { data, loading, error, refetch } = useAnalyticsQuery<
    TradeMetricsRow[]
  >(url, { select: normalizeRows });

  if (loading && !data) {
    return <AnalyticsCardSkeleton height="h-[300px]" className={className} />;
  }

  const rows = data ?? [];

  return (
    <AnalyticsCard
      title="Trade Metrics by Exchange"
      description={`Fill volume and outcomes · ${timeRangeLabel(timeRange)}`}
      icon={BarChart3}
      className={className}
      contentClassName="pt-2"
      info={
        <div className="space-y-1.5">
          <p>
            Stacked view of successful vs failed fills per exchange label.
            Sandbox fills appear as <code>exchange:test</code>.
          </p>
          <p className="text-background/80">
            Source: analytics-worker trade data points (blob4 = exchange).
          </p>
        </div>
      }
    >
      {error && rows.length === 0 ? (
        <AnalyticsErrorState error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <AnalyticsEmpty
          title="No trade metrics yet"
          description="When trade-worker executes orders, volume by exchange will chart here. Confirm analytics-worker is receiving /track/trade events."
        />
      ) : (
        <div className="space-y-4">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[280px] w-full sm:h-[320px]"
          >
            <BarChart
              data={rows}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="18%"
              barGap={2}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="exchange"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                angle={rows.length > 4 ? -25 : 0}
                textAnchor={rows.length > 4 ? "end" : "middle"}
                height={rows.length > 4 ? 56 : 32}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={40}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                cursor={{ fill: "var(--color-muted)", opacity: 0.35 }}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(label) => String(label)}
                  />
                }
              />
              <Legend
                verticalAlign="top"
                height={28}
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar
                dataKey="success_count"
                name="Success"
                stackId="fills"
                fill="var(--color-success_count)"
                radius={[0, 0, 0, 0]}
                maxBarSize={48}
              />
              <Bar
                dataKey="failure_count"
                name="Failures"
                stackId="fills"
                fill="var(--color-failure_count)"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ChartContainer>

          {/* Compact totals for screen-reader / mobile readability */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {rows.slice(0, 8).map((row) => {
              const rate =
                row.trade_count > 0
                  ? (row.success_count / row.trade_count) * 100
                  : 0;
              return (
                <div
                  key={row.exchange}
                  className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                >
                  <div className="truncate text-xs font-medium text-foreground">
                    {row.exchange}
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {row.trade_count.toLocaleString()}
                    </span>
                    <span
                      className={
                        rate >= 80
                          ? "text-xs tabular-nums text-success"
                          : "text-xs tabular-nums text-muted-foreground"
                      }
                    >
                      {rate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AnalyticsCard>
  );
}
