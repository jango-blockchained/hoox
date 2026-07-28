"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { TradeMetricsChart } from "@/components/dashboard/analytics/trade-metrics-chart";
import { SuccessRateCard } from "@/components/dashboard/analytics/success-rate-card";
import { WorkerPerformance } from "@/components/dashboard/analytics/worker-performance";
import { ApiStats } from "@/components/dashboard/analytics/api-stats";
import { SignalOutcomes } from "@/components/dashboard/analytics/signal-outcomes";
import { PageHeader } from "@/components/dashboard/page-header";
import { Chart } from "reicon-react";
import { Suspense } from "react";

export default function AnalyticsClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Chart className="h-8 w-8 text-primary" />}
        title="Analytics"
        description="Monitor trading system performance, API calls, and signal outcomes"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Suspense
          fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}
        >
          <SuccessRateCard />
        </Suspense>
        <Suspense
          fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}
        >
          <TradeMetricsChart />
        </Suspense>
      </div>

      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}
      >
        <WorkerPerformance />
      </Suspense>
      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}
      >
        <ApiStats />
      </Suspense>
      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}
      >
        <SignalOutcomes />
      </Suspense>
    </div>
  );
}
