"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HooxIcon } from "@/components/ui/hoox-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";

interface AIInsight {
  type: "info" | "warning" | "success";
  message: string;
  timestamp: Date;
}

const insights: AIInsight[] = [
  {
    type: "success",
    message:
      "All systems operating normally. Portfolio is well-balanced with 4 open positions across MEXC and Binance.",
    timestamp: new Date(),
  },
  {
    type: "info",
    message:
      "Current risk exposure is at 23% of maximum allowed. Trailing stops are active on 2 positions.",
    timestamp: new Date(Date.now() - 60000),
  },
  {
    type: "warning",
    message:
      "Monitor BTC/USDT position approaching take-profit target. Consider partial close.",
    timestamp: new Date(Date.now() - 120000),
  },
];

export function AiHealthCard() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [riskLevel, setRiskLevel] = useState(23);
  const [displayedInsights, setDisplayedInsights] = useState<AIInsight[]>([
    insights[0],
  ]);
  const indexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (indexRef.current + 1) % insights.length;
      indexRef.current = next;
      setDisplayedInsights((current) => {
        const newInsights = [insights[next], ...current];
        return newInsights.slice(0, 3);
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRiskLevel(Math.floor(Math.random() * 30) + 15);
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <HooxIcon name="check" size="sm" className="text-success" />;
      case "warning":
        return <HooxIcon name="alert" size="sm" className="text-warning" />;
      default:
        return <HooxIcon name="bolt" size="sm" className="text-primary" />;
    }
  };

  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5 overflow-hidden transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <div className="relative">
            <HooxIcon name="agent" size="sm" className="text-primary" />
            <motion.div
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          AI System Health
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-xs">
            <HooxIcon name="shield" size="xs" className="text-current" />
            Active
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <HooxIcon
              name="refresh"
              size="sm"
              className={`text-muted-foreground ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Risk Gauge */}
        <div className="rounded-lg bg-secondary/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              Risk Exposure
            </span>
            <span className="text-sm font-bold text-foreground">
              {riskLevel}%
            </span>
          </div>
          <Progress value={riskLevel} className="h-2" />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>

        {/* Insights Feed */}
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {displayedInsights.map((insight, index) => (
              <motion.div
                key={`${insight.message}-${index}`}
                initial={{ opacity: 0, height: 0, y: -20 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className={`rounded-lg border p-3 ${
                  insight.type === "warning"
                    ? "border-warning/30 bg-warning/5"
                    : insight.type === "success"
                      ? "border-success/30 bg-success/5"
                      : "border-primary/30 bg-primary/5"
                }`}
              >
                <div className="flex gap-3">
                  {getIcon(insight.type)}
                  <div className="flex-1">
                    <p className="text-sm leading-relaxed text-foreground">
                      {insight.message}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {insight.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Signals Today", value: "12" },
            { label: "Avg Response", value: "45ms" },
            { label: "Accuracy", value: "94%" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg bg-secondary/30 p-2 text-center"
            >
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
