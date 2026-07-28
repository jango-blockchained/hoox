"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetricsCards } from "@/components/dashboard/metrics-cards";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import { AiHealthCard } from "@/components/dashboard/ai-health-card";
import { WorkersOverview } from "@/components/dashboard/workers-overview";
import { DistributionChart } from "@/components/dashboard/distribution-chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { Activity } from "reicon-react";
import { Suspense } from "react";

// Mock data for distribution charts
const exchangeDistribution = [
  { name: "Binance", value: 45, fill: "hsl(var(--chart-1))" },
  { name: "Bybit", value: 30, fill: "hsl(var(--chart-2))" },
  { name: "MEXC", value: 25, fill: "hsl(var(--chart-3))" },
];

const sideDistribution = [
  { name: "Long", value: 60, fill: "hsl(var(--chart-4))" },
  { name: "Short", value: 40, fill: "hsl(var(--chart-5))" },
];

export default function DashboardClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Activity className="h-8 w-8 text-primary" />}
        title="Command Center"
        description="Monitor your trading system in real-time"
      />

      <Suspense
        fallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}
      >
        <MetricsCards />
      </Suspense>

      <div className="grid gap-6 md:grid-cols-2">
        <Suspense
          fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" />}
        >
          <PnlChart />
        </Suspense>
        <div className="flex flex-col gap-6">
          <Suspense
            fallback={
              <div className="h-48 animate-pulse rounded-lg bg-muted" />
            }
          >
            <DistributionChart
              data={exchangeDistribution}
              title="Exchange Distribution"
              description="Positions by exchange"
              type="donut"
            />
          </Suspense>
          <Suspense
            fallback={
              <div className="h-48 animate-pulse rounded-lg bg-muted" />
            }
          >
            <DistributionChart
              data={sideDistribution}
              title="Position Sides"
              description="Long vs Short distribution"
              type="pie"
            />
          </Suspense>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Suspense
          fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}
        >
          <AiHealthCard />
        </Suspense>
        <Suspense
          fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}
        >
          <WorkersOverview />
        </Suspense>
      </div>
    </div>
  );
}
