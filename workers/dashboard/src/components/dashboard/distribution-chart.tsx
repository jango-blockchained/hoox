"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { Cell, Pie, PieChart } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ChartPie } from "lucide-react";

export interface DistributionData {
  name: string;
  value: number;
  fill?: string;
}

interface DistributionChartProps {
  data: DistributionData[];
  title?: string;
  description?: string;
  type?: "pie" | "donut";
  className?: string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}

const FALLBACK_FILLS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function DistributionSkeleton({ title }: { title: string }) {
  return (
    <Card className="flex flex-col border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Skeleton className="mt-1 h-3 w-32" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center pb-4 pt-4">
        <Skeleton className="aspect-square w-full max-w-[180px] rounded-full" />
        <div className="mt-4 flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DistributionChart({
  data,
  title = "Distribution",
  description,
  type = "donut",
  className,
  loading = false,
  error = null,
  emptyTitle = "No positions yet",
  emptyDescription = "Open positions will appear here once the book is active.",
}: DistributionChartProps) {
  if (loading) {
    return <DistributionSkeleton title={title} />;
  }

  const chartConfig = data.reduce((acc, item, index) => {
    acc[item.name.toLowerCase().replace(/\s+/g, "-")] = {
      label: item.name,
      color: item.fill || FALLBACK_FILLS[index % FALLBACK_FILLS.length],
    };
    return acc;
  }, {} as ChartConfig);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const hasData = total > 0 && data.length > 0;

  return (
    <Card
      className={cn(
        "flex flex-col border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5 transition-all duration-300 hover:border-primary/40",
        className
      )}
    >
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {description && (
          <CardDescription className="text-center">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pb-4">
        {error ? (
          <div
            className="flex min-h-[200px] flex-1 items-center justify-center px-4 text-center"
            role="alert"
          >
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : !hasData ? (
          <Empty className="min-h-[200px] border-0 p-6 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartPie className="text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle className="text-sm">{emptyTitle}</EmptyTitle>
              <EmptyDescription className="text-xs">
                {emptyDescription}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square max-h-[220px] w-full"
              role="img"
              aria-label={`${title}: ${data
                .map(
                  (d) =>
                    `${d.name} ${((d.value / total) * 100).toFixed(0)} percent`
                )
                .join(", ")}`}
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => {
                        const num =
                          typeof value === "number" ? value : Number(value);
                        const pct =
                          total > 0 && Number.isFinite(num)
                            ? ((num / total) * 100).toFixed(1)
                            : "0";
                        return (
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {name}
                            </span>
                            <span className="font-mono font-medium">
                              {num} ({pct}%)
                            </span>
                          </span>
                        );
                      }}
                    />
                  }
                />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={type === "donut" ? 55 : 0}
                  outerRadius={90}
                  strokeWidth={2}
                  stroke="var(--color-card)"
                  paddingAngle={2}
                >
                  {data.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={
                        item.fill ||
                        FALLBACK_FILLS[index % FALLBACK_FILLS.length]
                      }
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {data.map((item, index) => (
                <li key={item.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        item.fill ||
                        FALLBACK_FILLS[index % FALLBACK_FILLS.length],
                    }}
                    aria-hidden
                  />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium tabular-nums">
                    {((item.value / total) * 100).toFixed(0)}%
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({item.value})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
