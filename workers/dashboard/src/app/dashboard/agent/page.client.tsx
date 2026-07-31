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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  AgentSubnav,
  HealthCheck,
  KillSwitch,
  TrailingStops,
  type TrailingStopRow,
} from "@/components/agent";
import { Activity, Brain, RefreshCw, Settings, Shield } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface AgentConfig {
  defaultProvider?: string;
  fallbackChain?: string[];
  trailingStopPercent?: number;
  takeProfitPercent?: number;
  maxDailyDrawdownPercent?: number;
}

interface AgentStatus {
  killSwitch?: boolean;
  config?: AgentConfig | null;
  activeStops?: number;
  stops?: TrailingStopRow[];
  lastCheck?: string;
}

interface AgentStatusResponse {
  success: boolean;
  status?: AgentStatus;
  error?: string;
}

interface KillSwitchResponse {
  success: boolean;
  message?: string;
  error?: string;
}

function formatPercent(value: number | undefined, fallback: number): string {
  const v = value ?? fallback;
  // Values may be stored as fraction (0.05) or percent (-5)
  if (Math.abs(v) <= 1 && v !== 0 && Number.isFinite(v)) {
    return `${(v * 100).toFixed((v * 100) % 1 === 0 ? 0 : 1)}%`;
  }
  return `${v}%`;
}

export default function AgentClient() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/agent/status", { signal });
      const data = (await res.json()) as AgentStatusResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch agent status");
      }
      setStatus(data.status ?? null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(
        e instanceof Error ? e.message : "Failed to fetch agent status"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal);
    return () => controller.abort();
  }, [fetchStatus]);

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchStatus();
  };

  const handleKillSwitch = async (
    action: "engage_kill_switch" | "release_kill_switch"
  ) => {
    const res = await fetch("/api/agent/risk-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json()) as KillSwitchResponse;
    if (!data.success) {
      const msg = data.error || "Action failed";
      toast.error(msg);
      throw new Error(msg);
    }
    toast.success(data.message ?? "Kill switch updated");
    await fetchStatus();
  };

  const config = status?.config ?? undefined;
  const killActive = Boolean(status?.killSwitch);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={<Brain className="h-8 w-8 text-primary" />}
          title="AI Agent"
          description="Ops console — status, risk controls, and health"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading || refreshing}
          className="shrink-0 self-start"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            data-icon="inline-start"
          />
          Refresh
        </Button>
      </div>

      <AgentSubnav />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl md:col-span-2" />
          <Skeleton className="h-64 w-full rounded-xl md:col-span-2" />
        </div>
      ) : (
        <>
          {/* Kill switch — full width when active for danger hierarchy */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={killActive ? "order-first" : undefined}
          >
            <KillSwitch active={killActive} onToggle={handleKillSwitch} />
          </motion.div>

          <div className="grid gap-4 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-border bg-card h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-5 w-5 text-primary" />
                    Runtime Status
                  </CardTitle>
                  <CardDescription>
                    {status?.lastCheck
                      ? `Checked ${new Date(status.lastCheck).toLocaleTimeString()}`
                      : "Live agent snapshot"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Trading
                      </span>
                      <Badge variant={killActive ? "destructive" : "default"}>
                        {killActive ? "Blocked" : "Allowed"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Provider
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {config?.defaultProvider || "workers-ai"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Active Stops
                      </span>
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {status?.activeStops ?? status?.stops?.length ?? 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card className="border-border bg-card h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-5 w-5 text-primary" />
                    Quick Links
                  </CardTitle>
                  <CardDescription>Jump to agent tools</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/dashboard/agent/models">
                        <Settings
                          className="h-4 w-4"
                          data-icon="inline-start"
                        />
                        Configure Models
                      </Link>
                    </Button>
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/dashboard/agent/risk">
                        <Shield className="h-4 w-4" data-icon="inline-start" />
                        Risk Management
                      </Link>
                    </Button>
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/dashboard/agent/chat">
                        <Brain className="h-4 w-4" data-icon="inline-start" />
                        Open Chat
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">
                  Configuration Summary
                </CardTitle>
                <CardDescription>Current agent configuration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Default Provider
                    </span>
                    <span className="text-sm font-medium">
                      {config?.defaultProvider || "workers-ai"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Fallback Chain
                    </span>
                    <span className="text-right text-sm font-medium">
                      {(config?.fallbackChain || ["workers-ai", "openai"]).join(
                        " → "
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Trailing Stop
                    </span>
                    <span className="text-sm font-medium">
                      {formatPercent(config?.trailingStopPercent, 0.05)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Take Profit
                    </span>
                    <span className="text-sm font-medium">
                      {formatPercent(config?.takeProfitPercent, 0.1)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 sm:col-span-2">
                    <span className="text-sm text-muted-foreground">
                      Max Daily Drawdown
                    </span>
                    <span className="text-sm font-medium text-destructive">
                      {config?.maxDailyDrawdownPercent != null
                        ? `${config.maxDailyDrawdownPercent}%`
                        : "-5%"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid gap-4 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <HealthCheck />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <TrailingStops
                stops={status?.stops ?? []}
                loading={false}
                onRefresh={handleRefresh}
              />
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
