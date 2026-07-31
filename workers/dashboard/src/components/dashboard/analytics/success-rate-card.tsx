/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useMemo } from "react";
import { Percent, TrendingDown, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  AnalyticsCard,
  AnalyticsEmpty,
  AnalyticsErrorState,
  AnalyticsCardSkeleton,
} from "./analytics-shell";
import {
  appendTimeRangeParams,
  timeRangeLabel,
  type TimeRangeKey,
} from "./time-range";
import { useAnalyticsQuery } from "./use-analytics-query";
import { cn } from "@/lib/utils";

interface SuccessRateRow {
  total: number;
  successes: number;
  failures?: number;
  success_rate: number;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Detailed success-rate panel (used when a dedicated card is preferred
 * over the KPI strip). Still driven by the shared time range.
 */
export function SuccessRateCard({
  timeRange = "30d",
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
    u.searchParams.set("type", "success-rate");
    appendTimeRangeParams(u, timeRange, { end: false });
    return u.pathname + u.search;
  }, [timeRange]);

  const { data, loading, error, refetch } =
    useAnalyticsQuery<SuccessRateRow[]>(url);

  if (loading && !data) {
    return <AnalyticsCardSkeleton height="h-[120px]" className={className} />;
  }

  if (error && !data) {
    return (
      <AnalyticsCard
        title="Trade Success Rate"
        description="Percentage of successful fills"
        icon={Percent}
        className={className}
        info={
          <p>
            Share of trade fills marked success by the trade-worker for{" "}
            {timeRangeLabel(timeRange).toLowerCase()}.
          </p>
        }
      >
        <AnalyticsErrorState error={error} onRetry={refetch} compact />
      </AnalyticsCard>
    );
  }

  const row = data?.[0];
  const total = num(row?.total);
  const successes = num(row?.successes);
  const rate = total > 0 ? num(row?.success_rate) : 0;
  const healthy = rate >= 80;

  return (
    <AnalyticsCard
      title="Trade Success Rate"
      description={`${timeRangeLabel(timeRange)} · fill outcomes`}
      icon={Percent}
      className={className}
      info={
        <p>
          Percentage of trade events with status <strong>success</strong>.
          Failures usually mean rejected orders, auth issues, or exchange
          downtime. Healthy fleets aim for ≥ 80%.
        </p>
      }
    >
      {total === 0 ? (
        <AnalyticsEmpty
          title="No trade outcomes yet"
          description="Once trade-worker starts filling orders, success rate will appear here."
          compact
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-4xl font-bold tabular-nums tracking-tight",
                  healthy ? "text-success" : "text-destructive"
                )}
              >
                {rate.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {successes.toLocaleString()} of {total.toLocaleString()} trades
                successful
              </div>
            </div>
            <div
              className={cn(
                "flex size-16 items-center justify-center rounded-full border-8",
                healthy
                  ? "border-success/25 text-success"
                  : "border-destructive/25 text-destructive"
              )}
            >
              {healthy ? (
                <TrendingUp className="size-6" />
              ) : (
                <TrendingDown className="size-6" />
              )}
            </div>
          </div>
          <Progress value={Math.min(100, Math.max(0, rate))} className="h-2" />
        </div>
      )}
    </AnalyticsCard>
  );
}
