"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CFServiceBadge,
  CFServiceType,
} from "@/components/ui/cf-service-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Shield,
  TrendingUp,
  Database,
  Brain,
  MessageSquare,
  Globe,
  Mail,
  RefreshCw,
  ChevronRight,
  BarChart3,
  FileText,
  AlertTriangle,
  CircleDot,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DEFAULT_WORKER_LIST } from "@/lib/settings/workers";
import { cn } from "@/lib/utils";

type BindingStatus = "healthy" | "degraded" | "down" | "unknown";

interface WorkerMeta {
  name: string;
  displayName: string;
  description: string;
  icon: typeof Shield;
  services?: CFServiceType[];
}

interface WorkerHealthRow {
  name: string;
  displayName: string;
  description: string;
  icon: typeof Shield;
  services?: CFServiceType[];
  status: BindingStatus;
  kvReachable: boolean | null;
  lastChecked: number | null;
  error?: string;
  latencyMs: number | null;
}

interface HealthApiWorker {
  kvReachable: boolean;
  lastChecked: number;
  error?: string;
}

const WORKER_META: Record<string, Omit<WorkerMeta, "name" | "displayName">> = {
  hoox: {
    description: "Webhook receiver",
    icon: Shield,
    services: [
      "Rate Limiting",
      "Queues",
      "Service Binding",
      "Durable Objects",
      "KV",
    ],
  },
  "trade-worker": {
    description: "Trading engine",
    icon: TrendingUp,
    services: ["D1", "Queues", "KV", "R2", "Service Binding"],
  },
  "d1-worker": {
    description: "Database operations",
    icon: Database,
    services: ["D1", "Service Binding"],
  },
  "agent-worker": {
    description: "Risk manager",
    icon: Brain,
    services: ["Workers AI", "D1", "Service Binding", "KV"],
  },
  "telegram-worker": {
    description: "Notifications",
    icon: MessageSquare,
    services: ["Service Binding", "R2", "KV", "Workers AI"],
  },
  "web3-wallet-worker": {
    description: "On-chain DEX",
    icon: Globe,
    services: ["Browser Rendering", "Service Binding"],
  },
  "email-worker": {
    description: "IMAP signals",
    icon: Mail,
    services: ["Service Binding"],
  },
  "analytics-worker": {
    description: "Metrics pipeline",
    icon: BarChart3,
    services: ["KV", "Service Binding"],
  },
  "report-worker": {
    description: "Scheduled reports",
    icon: FileText,
    services: ["R2", "KV", "Service Binding"],
  },
};

function statusFromHealth(health: HealthApiWorker | undefined): BindingStatus {
  if (!health) return "unknown";
  if (health.kvReachable) return "healthy";
  // Binding missing / KV error → down if explicit, else degraded
  if (health.error?.toLowerCase().includes("not bound")) return "down";
  return "degraded";
}

function statusLabel(s: BindingStatus): string {
  switch (s) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
    default:
      return "Unknown";
  }
}

function statusDotClass(s: BindingStatus): string {
  switch (s) {
    case "healthy":
      return "bg-success shadow-[0_0_8px_rgba(16,185,129,0.55)]";
    case "degraded":
      return "bg-warning shadow-[0_0_8px_rgba(234,179,8,0.45)]";
    case "down":
      return "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.45)]";
    default:
      return "bg-muted-foreground/50";
  }
}

function statusIconBg(s: BindingStatus): string {
  switch (s) {
    case "healthy":
      return "bg-success/10 text-success";
    case "degraded":
      return "bg-warning/10 text-warning";
    case "down":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export function WorkersOverview() {
  const [rows, setRows] = useState<WorkerHealthRow[]>(() =>
    DEFAULT_WORKER_LIST.map((w) => {
      const meta = WORKER_META[w.name];
      return {
        name: w.name,
        displayName: w.displayName,
        description: meta?.description ?? "Worker",
        icon: meta?.icon ?? Shield,
        services: meta?.services,
        status: "unknown" as BindingStatus,
        kvReachable: null,
        lastChecked: null,
        latencyMs: null,
      };
    })
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadHealth = useCallback(async (signal?: AbortSignal) => {
    setIsRefreshing(true);
    setFetchError(null);
    const started = performance.now();
    try {
      const [healthRes, agentRes] = await Promise.all([
        fetch("/api/workers/health", { signal }).catch(() => null),
        fetch("/api/agent/status", { signal }).catch(() => null),
      ]);
      const latencyMs = Math.round(performance.now() - started);

      let kill = false;
      if (agentRes?.ok) {
        try {
          const data = (await agentRes.json()) as {
            success?: boolean;
            status?: { killSwitch?: boolean };
          };
          kill = Boolean(data.success && data.status?.killSwitch);
        } catch {
          // ignore parse errors
        }
      }

      if (!healthRes) {
        setFetchError("Health endpoint unreachable");
        setLastCheckAt(Date.now());
        return;
      }
      if (!healthRes.ok) {
        setFetchError(`Health check failed (${healthRes.status})`);
        setLastCheckAt(Date.now());
        return;
      }

      const data = (await healthRes.json()) as {
        workers: Record<string, HealthApiWorker>;
      };
      const workers = data.workers ?? {};

      setRows(
        DEFAULT_WORKER_LIST.map((w) => {
          const meta = WORKER_META[w.name];
          const h = workers[w.name];
          let status = statusFromHealth(h);
          // Agent kill-switch surfaces as degraded even if KV is fine
          if (w.name === "agent-worker" && kill && status === "healthy") {
            status = "degraded";
          }
          return {
            name: w.name,
            displayName: w.displayName,
            description: meta?.description ?? "Worker",
            icon: meta?.icon ?? Shield,
            services: meta?.services,
            status,
            kvReachable: h ? h.kvReachable : null,
            lastChecked: h?.lastChecked ?? Date.now(),
            error:
              w.name === "agent-worker" && kill
                ? "Kill switch active"
                : h?.error,
            latencyMs: h ? latencyMs : null,
          };
        })
      );
      setLastCheckAt(Date.now());
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setFetchError(e instanceof Error ? e.message : "Health check failed");
      setLastCheckAt(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadHealth(controller.signal);
    const interval = setInterval(() => {
      void loadHealth();
    }, 30_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [loadHealth]);

  const counts = useMemo(() => {
    const c = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const degradedRows = rows.filter(
    (r) => r.status === "degraded" || r.status === "down"
  );

  const avgLatency = useMemo(() => {
    const samples = rows
      .map((r) => r.latencyMs)
      .filter((n): n is number => n !== null);
    if (samples.length === 0) return null;
    return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  }, [rows]);

  return (
    <Card className="border-border bg-card shadow-2xl shadow-primary/5 backdrop-blur-xl">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">
              Workers status matrix
            </CardTitle>
            <CardDescription className="text-xs">
              CONFIG_KV binding health · refreshed every 30s
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs tabular-nums">
              {counts.healthy}/{rows.length} healthy
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              onClick={() => void loadHealth()}
              disabled={isRefreshing}
              aria-label="Refresh worker health"
            >
              <RefreshCw
                className={cn(
                  "size-3.5 text-muted-foreground",
                  isRefreshing && "animate-spin"
                )}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Summary + last check */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile
            label="Healthy"
            value={counts.healthy}
            className="text-success"
          />
          <SummaryTile
            label="Degraded"
            value={counts.degraded}
            className="text-warning"
          />
          <SummaryTile
            label="Down"
            value={counts.down}
            className="text-destructive"
          />
          <SummaryTile
            label="Avg latency"
            value={avgLatency === null ? "—" : `${avgLatency}ms`}
            className="text-foreground"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3" />
            Last check: {relativeTime(lastCheckAt)}
          </span>
          <Legend />
        </div>

        {fetchError ? (
          <Alert className="border-warning/40 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-sm">Health check issue</AlertTitle>
            <AlertDescription className="text-xs">
              {fetchError}
            </AlertDescription>
          </Alert>
        ) : null}

        {degradedRows.length > 0 ? (
          <Alert className="border-border bg-secondary/20">
            <CircleDot className="h-4 w-4 text-warning" />
            <AlertTitle className="text-sm">Degraded explanation</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {degradedRows.map((r) => (
                  <li key={r.name}>
                    <span className="font-medium text-foreground">
                      {r.displayName}
                    </span>
                    :{" "}
                    {r.error ??
                      (r.status === "down"
                        ? "CONFIG_KV binding missing or unreachable"
                        : "KV reachable check failed")}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Workers list */}
        <div className="flex flex-col gap-1.5">
          {isRefreshing && lastCheckAt === null
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))
            : rows.map((worker) => (
                <div key={worker.name}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedWorker(
                        expandedWorker === worker.name ? null : worker.name
                      )
                    }
                    className="flex w-full items-center justify-between rounded-lg bg-secondary/30 p-2.5 transition-all duration-300 hover:scale-[1.01] hover:bg-secondary/50 hover:shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg transition-colors",
                          statusIconBg(worker.status)
                        )}
                      >
                        <worker.icon className="size-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-medium text-foreground">
                          {worker.displayName}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {worker.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {worker.latencyMs !== null ? (
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          {worker.latencyMs}ms
                        </span>
                      ) : null}
                      <Badge
                        variant="outline"
                        className="hidden h-5 font-normal text-[10px] sm:inline-flex"
                      >
                        {statusLabel(worker.status)}
                      </Badge>
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          statusDotClass(worker.status)
                        )}
                        aria-label={statusLabel(worker.status)}
                      />
                      <ChevronRight
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          expandedWorker === worker.name && "rotate-90"
                        )}
                      />
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedWorker === worker.name && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1 ml-11 flex flex-col gap-3 rounded-lg bg-secondary/20 p-3">
                          <div className="grid grid-cols-2 gap-3 text-[10px]">
                            <div>
                              <span className="text-muted-foreground">
                                Binding
                              </span>
                              <p className="font-medium text-foreground">
                                {worker.kvReachable === null
                                  ? "Unknown"
                                  : worker.kvReachable
                                    ? "CONFIG_KV reachable"
                                    : "CONFIG_KV unreachable"}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Last checked
                              </span>
                              <p className="font-medium text-foreground">
                                {relativeTime(worker.lastChecked)}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Probe latency
                              </span>
                              <p className="font-medium text-foreground tabular-nums">
                                {worker.latencyMs === null
                                  ? "—"
                                  : `${worker.latencyMs}ms`}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Status
                              </span>
                              <p className="font-medium text-foreground">
                                {statusLabel(worker.status)}
                              </p>
                            </div>
                          </div>

                          {worker.error ? (
                            <p className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-warning">
                              {worker.error}
                            </p>
                          ) : null}

                          {worker.services && worker.services.length > 0 && (
                            <div className="pt-1">
                              <span className="mb-1.5 block text-[10px] text-muted-foreground">
                                Services utilized
                              </span>
                              <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                                {worker.services.map((service) => (
                                  <CFServiceBadge
                                    key={service}
                                    service={service}
                                    isActive={worker.status === "healthy"}
                                    mini
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="text-[10px]">
                            <span className="text-muted-foreground">
                              Worker ID:{" "}
                            </span>
                            <code className="font-mono text-foreground">
                              {worker.name}
                            </code>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  className,
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className="rounded-lg bg-secondary/30 p-3">
      <p className={cn("text-xl font-bold tabular-nums", className)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {(
        [
          ["healthy", "Healthy"],
          ["degraded", "Degraded"],
          ["down", "Down"],
          ["unknown", "Unknown"],
        ] as const
      ).map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", statusDotClass(key))} />
          {label}
        </span>
      ))}
    </div>
  );
}
