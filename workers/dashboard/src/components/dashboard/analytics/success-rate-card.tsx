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
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Percent } from "lucide-react";
import { motion } from "framer-motion";

export function SuccessRateCard() {
  const [data, setData] = useState<{
    total: number;
    successes: number;
    success_rate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30d");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      try {
        const timeRangeParam =
          timeRange === "all"
            ? undefined
            : timeRange === "7d"
              ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const url = new URL(
          `/api/analytics/trade-metrics?type=success-rate`,
          window.location.origin
        );
        if (timeRangeParam) url.searchParams.set("timeRange", timeRangeParam);
        const res = await fetch(url.toString(), { signal: controller.signal });
        const json = (await res.json()) as {
          success: boolean;
          data?: {
            total: number;
            successes: number;
            success_rate: number;
          }[];
        };
        if (json.success && json.data && json.data.length > 0) {
          setData(json.data[0]);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("Failed to fetch success rate:", error);
      } finally {
        setLoading(false);
      }
    }
    if (mounted) fetchData();
    return () => controller.abort();
  }, [timeRange, mounted]);

  if (!mounted) return null;

  const rate = data?.success_rate || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Trade Success Rate</CardTitle>
                <CardDescription>
                  Percentage of successful trades
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
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[100px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-4xl font-bold">{rate.toFixed(1)}%</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {data?.successes || 0} of {data?.total || 0} trades
                    successful
                  </div>
                </div>
                <div className="size-16 rounded-full border-8 border-primary/20 flex items-center justify-center">
                  {rate >= 80 ? (
                    <TrendingUp className="h-6 w-6 text-success" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-destructive" />
                  )}
                </div>
              </div>
              <Progress value={rate} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
