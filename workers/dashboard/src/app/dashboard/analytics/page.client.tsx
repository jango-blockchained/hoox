/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Chart } from "reicon-react";
import {
  ApiStats,
  KpiStrip,
  SectionLabel,
  SignalOutcomes,
  TradeMetricsChart,
  WorkerPerformance,
  AnalyticsToolbar,
  timeRangeLabel,
  type TimeRangeKey,
} from "@/components/dashboard/analytics";

const DEFAULT_RANGE: TimeRangeKey = "7d";

export default function AnalyticsClient() {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>(DEFAULT_RANGE);
  /** Bump to remount panels and force a full refetch. */
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const summaryText = useMemo(() => {
    const when = new Date().toISOString();
    return [
      "HOOX Analytics summary",
      `Range: ${timeRangeLabel(timeRange)}`,
      `Generated: ${when}`,
      "",
      "Panels: Success rate KPIs · Trade metrics by exchange · Worker performance · API call stats · Signal outcomes",
      "Source: Cloudflare Analytics Engine via analytics-worker dataset hoox-analytics",
      "",
      "Open /dashboard/analytics for the live command surface.",
    ].join("\n");
  }, [timeRange]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={<Chart className="h-8 w-8 text-primary" />}
          title="Analytics"
          description="Trading performance, worker health, API latency, and signal flow — one command surface"
        />
        <AnalyticsToolbar
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          onRefresh={handleRefresh}
          summaryText={summaryText}
          className="shrink-0"
        />
      </div>

      {/* KPI row */}
      <section
        className="flex flex-col gap-3"
        aria-label="Key performance indicators"
      >
        <SectionLabel>Key metrics · {timeRangeLabel(timeRange)}</SectionLabel>
        <KpiStrip
          key={`kpi-${refreshKey}-${timeRange}`}
          timeRange={timeRange}
        />
      </section>

      {/* Charts */}
      <section className="flex flex-col gap-3" aria-label="Trade charts">
        <SectionLabel>Trade activity</SectionLabel>
        <TradeMetricsChart
          key={`trades-${refreshKey}-${timeRange}`}
          timeRange={timeRange}
        />
      </section>

      {/* Breakdowns */}
      <section
        className="flex flex-col gap-3"
        aria-label="Operational breakdowns"
      >
        <SectionLabel>Operational breakdowns</SectionLabel>
        <div className="grid gap-6 lg:grid-cols-2">
          <WorkerPerformance
            key={`workers-${refreshKey}-${timeRange}`}
            timeRange={timeRange}
          />
          <ApiStats
            key={`api-${refreshKey}-${timeRange}`}
            timeRange={timeRange}
          />
        </div>
        <SignalOutcomes
          key={`signals-${refreshKey}-${timeRange}`}
          timeRange={timeRange}
        />
      </section>
    </div>
  );
}
