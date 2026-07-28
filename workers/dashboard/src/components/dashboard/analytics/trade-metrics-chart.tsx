"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

const chartConfig = {
  trade_count: {
    label: "Trades",
    color: "var(--color-chart-1)",
  },
  success_count: {
    label: "Success",
    color: "var(--color-chart-2)",
  },
  failure_count: {
    label: "Failures",
    color: "var(--color-chart-3)",
  },
};

interface TradeMetricsRow {
  exchange: string;
  trade_count: number;
  success_count: number;
  failure_count: number;
}

export function TradeMetricsChart() {
  const [data, setData] = useState<TradeMetricsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      try {
        const end = new Date().toISOString();
        const start = new Date(
          Date.now() -
            (timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90) *
              24 *
              60 *
              60 *
              1000
        ).toISOString();
        const res = await fetch(
          `/api/analytics/trade-metrics?start=${start}&end=${end}`,
          { signal: controller.signal }
        );
        const json = (await res.json()) as {
          success: boolean;
          data?: TradeMetricsRow[];
        };
        if (json.success) {
          setData(json.data || []);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("Failed to fetch trade metrics:", error);
      } finally {
        setLoading(false);
      }
    }
    if (mounted) fetchData();
    return () => controller.abort();
  }, [timeRange, mounted]);

  if (!mounted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Trade Metrics by Exchange</CardTitle>
                <CardDescription>
                  Trading activity across exchanges
                </CardDescription>
              </div>
            </div>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[300px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              No trade data available
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px]">
              <ResponsiveContainer>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="exchange" />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="trade_count"
                    fill="var(--color-chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="success_count"
                    fill="var(--color-chart-2)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="failure_count"
                    fill="var(--color-chart-3)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
