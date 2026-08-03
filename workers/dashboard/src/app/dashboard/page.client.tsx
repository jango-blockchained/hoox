"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetricsCards } from "@/components/dashboard/metrics-cards";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import { AiHealthCard } from "@/components/dashboard/ai-health-card";
import { WorkersOverview } from "@/components/dashboard/workers-overview";
import { OverviewDistributions } from "@/components/dashboard/overview-distributions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "reicon-react";
import { Suspense } from "react";

function MetricsFallback() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

function ChartFallback({ className }: { className?: string }) {
  return <Skeleton className={className ?? "h-80 w-full rounded-xl"} />;
}

export default function DashboardClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Activity className="h-8 w-8 text-primary" />}
        title="Command Center"
        description="Portfolio health, exposure, AI agent status, and worker pulse"
      />

      <Suspense fallback={<MetricsFallback />}>
        <MetricsCards />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<ChartFallback className="h-[360px] rounded-xl" />}>
          <PnlChart />
        </Suspense>
        <Suspense fallback={<ChartFallback className="h-[360px] rounded-xl" />}>
          <OverviewDistributions />
        </Suspense>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<ChartFallback className="h-64 rounded-xl" />}>
          <AiHealthCard />
        </Suspense>
        <Suspense fallback={<ChartFallback className="h-64 rounded-xl" />}>
          <WorkersOverview />
        </Suspense>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<ChartFallback className="h-80 rounded-xl" />}>
          <RecentActivity />
        </Suspense>
        <Suspense fallback={<ChartFallback className="h-80 rounded-xl" />}>
          <QuickActions />
        </Suspense>
      </div>
    </div>
  );
}
