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
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

const DAILY_DATA = [
  { date: "2026-04-28", "workers-ai": 120, openai: 45, anthropic: 12 },
  { date: "2026-04-29", "workers-ai": 150, openai: 52, anthropic: 15 },
  { date: "2026-04-30", "workers-ai": 180, openai: 60, anthropic: 18 },
  { date: "2026-05-01", "workers-ai": 200, openai: 70, anthropic: 20 },
  { date: "2026-05-02", "workers-ai": 170, openai: 65, anthropic: 16 },
  { date: "2026-05-03", "workers-ai": 190, openai: 68, anthropic: 19 },
];

const chartConfig = {
  "workers-ai": { label: "Workers AI", color: "hsl(var(--chart-1))" },
  openai: { label: "OpenAI", color: "hsl(var(--chart-2))" },
  anthropic: { label: "Anthropic", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

export function UsageChart() {
  const [timeRange, setTimeRange] = useState("7d");

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Usage Over Time</CardTitle>
            <CardDescription>Tokens consumed per day</CardDescription>
          </div>
          <Tabs value={timeRange} onValueChange={setTimeRange}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <AreaChart data={DAILY_DATA}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(5)}
            />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="workers-ai"
              stroke="var(--color-workers-ai)"
              fill="var(--color-workers-ai)"
              fillOpacity={0.2}
            />
            <Area
              type="monotone"
              dataKey="openai"
              stroke="var(--color-openai)"
              fill="var(--color-openai)"
              fillOpacity={0.2}
            />
            <Area
              type="monotone"
              dataKey="anthropic"
              stroke="var(--color-anthropic)"
              fill="var(--color-anthropic)"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
