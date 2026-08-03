"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HooxIcon } from "@/components/ui/hoox-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

interface ProviderHealth {
  name: string;
  healthy: boolean;
  latency?: number;
  error?: string;
}

interface AgentStatus {
  killSwitch?: boolean;
  activeStops?: number;
  lastCheck?: string;
  config?: {
    maxDailyDrawdownPercent?: number;
    trailingStopPercent?: number;
    takeProfitPercent?: number;
    defaultProvider?: string;
  };
}

type OverallStatus = "healthy" | "degraded" | "blocked" | "unknown";

function statusBadge(status: OverallStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "healthy":
      return {
        label: "Healthy",
        className: "bg-success/15 text-success border-success/30",
      };
    case "degraded":
      return {
        label: "Degraded",
        className: "bg-warning/15 text-warning border-warning/30",
      };
    case "blocked":
      return {
        label: "Kill switch",
        className: "bg-destructive/15 text-destructive border-destructive/30",
      };
    default:
      return {
        label: "Unknown",
        className: "bg-secondary text-muted-foreground",
      };
  }
}

function AiHealthSkeleton() {
  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AiHealthCard() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [statusRes, healthRes] = await Promise.all([
        fetch("/api/agent/status"),
        fetch("/api/agent/health"),
      ]);

      const statusJson = (await statusRes.json()) as {
        success?: boolean;
        status?: AgentStatus;
        error?: string;
      };
      const healthJson = (await healthRes.json()) as {
        success?: boolean;
        providers?:
          | Record<
              string,
              { healthy: boolean; latency?: number; error?: string }
            >
          | ProviderHealth[];
      };

      if (statusJson.success && statusJson.status) {
        setStatus(statusJson.status);
      } else if (!statusRes.ok) {
        setError(statusJson.error || "Agent status unavailable");
      }

      if (healthJson.success && healthJson.providers) {
        if (Array.isArray(healthJson.providers)) {
          setProviders(healthJson.providers);
        } else {
          setProviders(
            Object.entries(healthJson.providers).map(([name, info]) => ({
              name,
              healthy: info.healthy,
              latency: info.latency,
              error: info.error,
            }))
          );
        }
      }

      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI health");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return <AiHealthSkeleton />;
  }

  const healthyProviders = providers.filter((p) => p.healthy).length;
  const totalProviders = providers.length;
  const avgLatency =
    providers.filter((p) => p.healthy && typeof p.latency === "number").length >
    0
      ? Math.round(
          providers
            .filter((p) => p.healthy && typeof p.latency === "number")
            .reduce((s, p) => s + (p.latency ?? 0), 0) /
            providers.filter((p) => p.healthy && typeof p.latency === "number")
              .length
        )
      : null;

  const overall: OverallStatus = status?.killSwitch
    ? "blocked"
    : error && !status
      ? "unknown"
      : totalProviders > 0 && healthyProviders === 0
        ? "degraded"
        : totalProviders > 0 && healthyProviders < totalProviders
          ? "degraded"
          : status
            ? "healthy"
            : "unknown";

  const badge = statusBadge(overall);
  const maxDd = status?.config?.maxDailyDrawdownPercent;
  // Express configured max drawdown as a risk budget gauge (absolute %).
  const riskBudgetPct =
    typeof maxDd === "number" && Number.isFinite(maxDd)
      ? Math.min(100, Math.max(0, Math.abs(maxDd) * (maxDd <= 1 ? 100 : 1)))
      : null;

  const insights: {
    type: "info" | "warning" | "success";
    message: string;
  }[] = [];

  if (status?.killSwitch) {
    insights.push({
      type: "warning",
      message:
        "Kill switch is engaged — trade execution is blocked until released.",
    });
  } else if (overall === "healthy") {
    insights.push({
      type: "success",
      message: "AI agent is online and providers are responding.",
    });
  }

  if (totalProviders > 0 && healthyProviders < totalProviders) {
    insights.push({
      type: "warning",
      message: `${totalProviders - healthyProviders} of ${totalProviders} AI providers unhealthy.`,
    });
  }

  if (typeof status?.activeStops === "number") {
    insights.push({
      type: "info",
      message:
        status.activeStops > 0
          ? `${status.activeStops} trailing stop watermark${status.activeStops === 1 ? "" : "s"} active.`
          : "No active trailing stop watermarks.",
    });
  }

  if (insights.length === 0 && error) {
    insights.push({
      type: "warning",
      message: error,
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: "info",
      message: "Connect agent-worker and CONFIG_KV to populate live AI health.",
    });
  }

  return (
    <Card className="overflow-hidden border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <div className="relative">
              <HooxIcon name="agent" size="sm" className="text-primary" />
              <motion.div
                className={cn(
                  "absolute -right-0.5 -top-0.5 size-2 rounded-full",
                  overall === "healthy" && "bg-success",
                  overall === "degraded" && "bg-warning",
                  overall === "blocked" && "bg-destructive",
                  overall === "unknown" && "bg-muted-foreground"
                )}
                animate={
                  overall === "healthy" ? { scale: [1, 1.25, 1] } : undefined
                }
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            AI System Health
          </CardTitle>
          <CardDescription className="mt-0.5 text-xs">
            {lastChecked
              ? `Last checked ${lastChecked.toLocaleTimeString()}`
              : "Agent & provider status"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn("gap-1 text-xs", badge.className)}
          >
            <HooxIcon name="shield" size="xs" className="text-current" />
            {badge.label}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh AI health"
          >
            <HooxIcon
              name="refresh"
              size="sm"
              className={cn(
                "text-muted-foreground",
                refreshing && "animate-spin"
              )}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Risk / drawdown budget */}
        <div className="rounded-lg bg-secondary/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Max daily drawdown budget
            </span>
            <span className="text-sm font-bold text-foreground">
              {riskBudgetPct !== null ? `${riskBudgetPct.toFixed(1)}%` : "—"}
            </span>
          </div>
          <Progress
            value={riskBudgetPct ?? 0}
            className="h-2"
            aria-label="Configured max daily drawdown percent"
          />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>Configured limit</span>
            <span>
              {status?.config?.defaultProvider
                ? `Provider: ${status.config.defaultProvider}`
                : "No provider set"}
            </span>
          </div>
        </div>

        {/* Insights */}
        <div className="flex flex-col gap-2" aria-label="AI health insights">
          {insights.slice(0, 3).map((insight, index) => (
            <div
              key={`${insight.message}-${index}`}
              className={cn(
                "rounded-lg border p-3",
                insight.type === "warning" && "border-warning/30 bg-warning/5",
                insight.type === "success" && "border-success/30 bg-success/5",
                insight.type === "info" && "border-primary/30 bg-primary/5"
              )}
            >
              <div className="flex gap-3">
                {insight.type === "success" ? (
                  <HooxIcon name="check" size="sm" className="text-success" />
                ) : insight.type === "warning" ? (
                  <HooxIcon name="alert" size="sm" className="text-warning" />
                ) : (
                  <HooxIcon name="bolt" size="sm" className="text-primary" />
                )}
                <p className="text-sm leading-relaxed text-foreground">
                  {insight.message}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-secondary/30 p-2 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">
              {totalProviders > 0
                ? `${healthyProviders}/${totalProviders}`
                : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Providers OK</p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-2 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">
              {avgLatency !== null ? `${avgLatency}ms` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Avg latency</p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-2 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">
              {typeof status?.activeStops === "number"
                ? status.activeStops
                : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Active stops</p>
          </div>
        </div>

        {/* Provider chips */}
        {providers.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="AI providers">
            {providers.map((p) => (
              <li key={p.name}>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] capitalize",
                    p.healthy
                      ? "border-success/30 text-success"
                      : "border-destructive/30 text-destructive"
                  )}
                  title={
                    p.error ||
                    (p.latency != null ? `${p.latency}ms` : undefined)
                  }
                >
                  {p.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <Button asChild variant="outline" size="sm" className="w-full gap-2">
          <Link href="/dashboard/agent">
            Open AI Agent
            <ExternalLink className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
