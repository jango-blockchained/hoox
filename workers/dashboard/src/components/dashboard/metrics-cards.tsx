"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { HooxIcon } from "@/components/ui/hoox-icon";

interface MetricData {
  title: string;
  value: number;
  displayValue: string;
  suffix?: string;
  description: string;
  icon: "activity" | "trendUp" | "wallet" | "alert";
  trend: string | null;
  trendUp: boolean | null;
}

const initialMetrics: MetricData[] = [
  {
    title: "Total Trades",
    value: 0,
    displayValue: "0",
    description: "Lifetime",
    icon: "activity",
    trend: null,
    trendUp: null,
  },
  {
    title: "Win Rate",
    value: 0,
    displayValue: "N/A",
    suffix: "%",
    description: "Last 30 days",
    icon: "trendUp",
    trend: null,
    trendUp: null,
  },
  {
    title: "Open Positions",
    value: 0,
    displayValue: "0",
    description: "Active",
    icon: "wallet",
    trend: null,
    trendUp: null,
  },
  {
    title: "Daily Drawdown",
    value: 0,
    displayValue: "0",
    suffix: "%",
    description: "Max: -5%",
    icon: "alert",
    trend: "Safe",
    trendUp: true,
  },
];

function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const startValue = displayValue;
    const endValue = value;
    const duration = 500;
    const startTime = Date.now();
    let rafId: number;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = startValue + (endValue - startValue) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafId);
  }, [value]);

  const display = (() => {
    if (Math.abs(displayValue) >= 1000) {
      return (
        displayValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) +
        suffix
      );
    }
    if (Math.abs(displayValue) < 10) {
      return displayValue.toFixed(1) + suffix;
    }
    return Math.round(displayValue).toLocaleString() + suffix;
  })();

  return (
    <motion.span
      key={value}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 0.3 }}
    >
      {display}
    </motion.span>
  );
}

function SparkLine({ data, positive }: { data: number[]; positive: boolean }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = useMemo(
    () =>
      data
        .map((value, index) => {
          const x = (index / (data.length - 1)) * 60;
          const y = 20 - ((value - min) / range) * 16;
          return `${x},${y}`;
        })
        .join(" "),
    [data, min, range]
  );

  return (
    <svg className="h-5 w-15" viewBox="0 0 60 24">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "var(--color-success)" : "var(--color-destructive)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MetricsCards() {
  const [metrics, setMetrics] = useState(initialMetrics);
  const sparkData: Record<string, number[]> = {
    "Total Trades": [0, 0, 0, 0, 0, 0, 0],
    "Win Rate": [0, 0, 0, 0, 0, 0, 0],
    "Open Positions": [0, 0, 0, 0, 0, 0, 0],
    "Daily Drawdown": [0, 0, 0, 0, 0, 0, 0],
  };

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await api.getStats();
        if (data.success && data.stats) {
          setMetrics((prev) =>
            prev.map((metric) => {
              if (metric.title === "Total Trades") {
                return {
                  ...metric,
                  value: data.stats.totalTrades,
                  displayValue: String(data.stats.totalTrades),
                };
              }
              if (metric.title === "Win Rate") {
                const winRate =
                  data.stats.winRate === "N/A"
                    ? 0
                    : parseFloat(data.stats.winRate);
                return {
                  ...metric,
                  value: winRate,
                  displayValue: data.stats.winRate,
                };
              }
              if (metric.title === "Open Positions") {
                return {
                  ...metric,
                  value: data.stats.openPositions,
                  displayValue: String(data.stats.openPositions),
                };
              }
              return metric;
            })
          );
        }
      } catch {
        // Silently fail — metrics stay at initial values
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <motion.div
          key={metric.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.1 }}
        >
          <Card className="group relative overflow-hidden border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 hover:scale-[1.02]">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <CardContent className="relative p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {metric.title}
                </span>
                <div className="flex size-8 items-center justify-center rounded-lg bg-secondary/50 transition-colors group-hover:bg-primary/10">
                  <HooxIcon
                    name={metric.icon}
                    size="sm"
                    className="text-muted-foreground transition-colors group-hover:text-primary"
                  />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  <AnimatedNumber value={metric.value} suffix={metric.suffix} />
                </span>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {metric.description}
                    </span>
                    {metric.trend && (
                      <span
                        className={`flex items-center gap-0.5 text-xs font-medium ${
                          metric.trendUp ? "text-success" : "text-destructive"
                        }`}
                      >
                        {metric.trendUp ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )}
                        {metric.trend}
                      </span>
                    )}
                  </div>
                  <SparkLine
                    data={sparkData[metric.title] || []}
                    positive={metric.trendUp ?? true}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
