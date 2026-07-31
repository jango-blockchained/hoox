/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Percent,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AnalyticsErrorState, KpiSkeleton, KpiTile } from "./analytics-shell";
import {
  appendTimeRangeParams,
  timeRangeLabel,
  type TimeRangeKey,
} from "./time-range";
import { useAnalyticsQuery } from "./use-analytics-query";

interface SuccessRateRow {
  total: number;
  successes: number;
  failures?: number;
  success_rate: number;
}

interface TradeMetricsRow {
  exchange: string;
  trade_count: number;
  success_count: number;
  failure_count: number;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function KpiStrip({ timeRange }: { timeRange: TimeRangeKey }) {
  const successUrl = useMemo(() => {
    const url = new URL(
      "/api/analytics/trade-metrics",
      typeof window !== "undefined" ? window.location.origin : "http://local"
    );
    url.searchParams.set("type", "success-rate");
    appendTimeRangeParams(url, timeRange, { end: false });
    return url.pathname + url.search;
  }, [timeRange]);

  const metricsUrl = useMemo(() => {
    const url = new URL(
      "/api/analytics/trade-metrics",
      typeof window !== "undefined" ? window.location.origin : "http://local"
    );
    appendTimeRangeParams(url, timeRange);
    return url.pathname + url.search;
  }, [timeRange]);

  const success = useAnalyticsQuery<SuccessRateRow[]>(successUrl);
  const metrics = useAnalyticsQuery<TradeMetricsRow[]>(metricsUrl);

  const loading = success.loading || metrics.loading;
  const error = success.error || metrics.error;

  if (loading && !success.data && !metrics.data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
      </div>
    );
  }

  if (error && !success.data && !metrics.data) {
    return (
      <AnalyticsErrorState
        error={error}
        onRetry={() => {
          success.refetch();
          metrics.refetch();
        }}
        compact
      />
    );
  }

  const rateRow = success.data?.[0];
  const total = num(rateRow?.total);
  const successes = num(rateRow?.successes);
  const failures =
    rateRow?.failures != null
      ? num(rateRow.failures)
      : Math.max(0, total - successes);
  const rate = total > 0 ? num(rateRow?.success_rate) : 0;

  const exchangeRows = metrics.data ?? [];
  const exchangeCount = exchangeRows.filter(
    (r) => r.exchange && String(r.exchange).length > 0
  ).length;
  const topExchange = exchangeRows[0];

  const rangeHint = timeRangeLabel(timeRange);
  const rateTone =
    total === 0
      ? "muted"
      : rate >= 80
        ? "success"
        : rate >= 50
          ? "warning"
          : "danger";

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label="Success rate"
        icon={Percent}
        delay={0}
        tone={rateTone}
        value={total === 0 ? "—" : `${rate.toFixed(1)}%`}
        hint={
          total === 0 ? (
            <span>No trades in {rangeHint.toLowerCase()}</span>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {rate >= 80 ? (
                  <TrendingUp className="size-3.5 text-success" />
                ) : (
                  <TrendingDown className="size-3.5 text-destructive" />
                )}
                <span>
                  {successes.toLocaleString()} of {total.toLocaleString()} fills
                  succeeded · {rangeHint}
                </span>
              </div>
              <Progress
                value={Math.min(100, Math.max(0, rate))}
                className="h-1.5"
              />
            </div>
          )
        }
        info={
          <p>
            Share of trade fills marked <strong>success</strong> by the
            trade-worker. Failures include rejected or failed exchange orders.
            Target for healthy systems is typically ≥ 80%.
          </p>
        }
      />

      <KpiTile
        label="Total trades"
        icon={Activity}
        delay={0.05}
        value={total === 0 ? "—" : total.toLocaleString()}
        hint={
          total === 0
            ? "Waiting for trade-worker activity"
            : `${rangeHint} · tracked via analytics-worker`
        }
        info={
          <p>
            Count of trade data points written to Analytics Engine. Includes
            both successful and failed fills in the selected window.
          </p>
        }
      />

      <KpiTile
        label="Failures"
        icon={AlertTriangle}
        delay={0.1}
        tone={failures > 0 ? "danger" : total === 0 ? "muted" : "success"}
        value={total === 0 ? "—" : failures.toLocaleString()}
        hint={
          total === 0
            ? "No failure samples yet"
            : failures === 0
              ? "No failed fills in range"
              : `${((failures / Math.max(total, 1)) * 100).toFixed(1)}% of trades`
        }
        info={
          <p>
            Trade events where the exchange response was not successful. Spike
            here often means credentials, rate limits, or invalid order params.
          </p>
        }
      />

      <KpiTile
        label="Exchanges active"
        icon={Target}
        delay={0.15}
        value={exchangeCount === 0 ? "—" : exchangeCount.toLocaleString()}
        hint={
          topExchange
            ? `Top volume: ${topExchange.exchange} (${num(topExchange.trade_count).toLocaleString()} trades)`
            : "No exchange breakdown yet"
        }
        info={
          <p>
            Distinct exchange labels seen on trade events in this window
            (includes <code>:test</code> suffixes for sandbox fills).
          </p>
        }
      />

      {(success.error || metrics.error) && (
        <div className="sm:col-span-2 xl:col-span-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="flex-1">
              {(success.error || metrics.error)?.message}
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                success.refetch();
                metrics.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
