"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { parseUsage, type ProviderUsage } from "@/components/agent/usage-table";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface UsageApiResponse {
  success: boolean;
  usage?: Record<
    string,
    {
      requests?: number;
      tokens?: number;
      cost?: number;
      avgLatency?: number;
    }
  >;
  note?: string;
  error?: string;
}

interface UsageChartProps {
  providers?: ProviderUsage[];
  loading?: boolean;
  note?: string | null;
}

export function UsageChart({
  providers: controlledProviders,
  loading: controlledLoading,
  note: controlledNote,
}: UsageChartProps = {}) {
  const isControlled = controlledProviders !== undefined;
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [loading, setLoading] = useState(!isControlled);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (isControlled) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/agent/usage", {
          signal: controller.signal,
        });
        const data = (await res.json()) as UsageApiResponse;
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to load usage");
        }
        setProviders(parseUsage(data.usage));
        setNote(data.note ?? null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error(e instanceof Error ? e.message : "Failed to load usage");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isControlled]);

  const rows = isControlled ? (controlledProviders ?? []) : providers;
  const isLoading = isControlled ? Boolean(controlledLoading) : loading;
  const displayNote = isControlled ? controlledNote : note;

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    rows.forEach((p, i) => {
      config[p.name] = {
        label: p.name,
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    });
    return config;
  }, [rows]);

  const chartData = useMemo(
    () =>
      rows.map((p) => ({
        provider: p.name,
        tokens: p.tokens,
        requests: p.requests,
        fill: chartConfig[p.name]?.color ?? CHART_COLORS[0],
      })),
    [rows, chartConfig]
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">Usage by Provider</CardTitle>
        <CardDescription>
          Tokens consumed per AI provider
          {displayNote ? (
            <span className="mt-1 block text-xs text-muted-foreground/80">
              {displayNote}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </div>
        ) : chartData.length === 0 ? (
          <Empty className="min-h-[280px] border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BarChart3 className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No usage data</EmptyTitle>
              <EmptyDescription>
                {displayNote ||
                  "Charts populate when the agent records token usage per provider."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="provider"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span>
                        {name === "tokens" || name === "Tokens"
                          ? `${Number(value).toLocaleString()} tokens`
                          : String(value)}
                      </span>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="tokens" name="Tokens" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.provider} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
