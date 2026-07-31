"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CFServiceBadge,
  type CFServiceType,
} from "@/components/ui/cf-service-badge";
import {
  Webhook,
  Shield,
  TrendingUp,
  Brain,
  Database,
  MessageSquare,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ExternalLink,
  ScrollText,
  ChartCandlestick,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type WorkerStatus } from "@/lib/api";

// ── Pipeline stages (architecture SSOT) ──────────────────────────────
// Flow: external webhook → gateway → trade/agent → D1 → telegram

type StageStatus = "healthy" | "degraded" | "down" | "unknown" | "external";

interface PipelineStage {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: typeof Webhook;
  /** Maps to api.getWorkersStatus() name when applicable */
  workerName?: string;
  /** Analytics Engine worker key for optional latency */
  analyticsWorker?: string;
  services: CFServiceType[];
  /** Parallel branch label (e.g. trade vs agent) */
  branch?: "primary" | "secondary" | "join";
}

const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    id: "webhook",
    name: "Webhook",
    shortName: "Ingest",
    description:
      "TradingView, email, and external clients POST signals into the edge.",
    icon: Webhook,
    services: ["Rate Limiting"],
  },
  {
    id: "gateway",
    name: "Gateway",
    shortName: "Gateway",
    description:
      "hoox gateway: auth, kill switch, idempotency, and trade routing.",
    icon: Shield,
    // Not in getWorkersStatus list — status inferred from downstream health
    analyticsWorker: "hoox",
    services: [
      "Rate Limiting",
      "Queues",
      "Service Binding",
      "Durable Objects",
      "KV",
    ],
  },
  {
    id: "trade",
    name: "Trade",
    shortName: "Execute",
    description: "trade-worker places orders on Binance, MEXC, Bybit, etc.",
    icon: TrendingUp,
    workerName: "trade-worker",
    analyticsWorker: "trade-worker",
    branch: "primary",
    services: ["D1", "Queues", "KV", "R2", "Service Binding"],
  },
  {
    id: "agent",
    name: "Agent",
    shortName: "Risk AI",
    description: "agent-worker monitors portfolio risk and may override size.",
    icon: Brain,
    workerName: "agent-worker",
    analyticsWorker: "agent-worker",
    branch: "secondary",
    services: ["Workers AI", "D1", "Service Binding", "KV"],
  },
  {
    id: "d1",
    name: "D1",
    shortName: "Persist",
    description:
      "d1-worker stores trade_signals, trades, positions, and system_logs.",
    icon: Database,
    workerName: "d1-worker",
    analyticsWorker: "d1-worker",
    branch: "join",
    services: ["D1", "Service Binding"],
  },
  {
    id: "telegram",
    name: "Telegram",
    shortName: "Notify",
    description: "telegram-worker delivers operator alerts and summaries.",
    icon: MessageSquare,
    workerName: "telegram-worker",
    analyticsWorker: "telegram-worker",
    services: ["Service Binding", "R2", "KV", "Workers AI"],
  },
] as const;

interface StageRuntime {
  status: StageStatus;
  latencyMs?: number;
  lastCheck?: string;
  analyticsAvgMs?: number | null;
  analyticsError?: string | null;
}

interface WorkerPerfRow {
  data_type: string;
  total_requests: number;
  total_errors: number;
  avg_duration_ms: number;
}

// ── Status helpers ───────────────────────────────────────────────────

function statusLabel(status: StageStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
    case "external":
      return "External";
    default:
      return "Unknown";
  }
}

function statusBadgeClass(status: StageStatus): string {
  switch (status) {
    case "healthy":
      return "border-success/30 bg-success/10 text-success";
    case "degraded":
      return "border-warning/30 bg-warning/10 text-warning";
    case "down":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "external":
      return "border-primary/30 bg-primary/10 text-primary";
    default:
      return "border-border bg-secondary/40 text-muted-foreground";
  }
}

function statusDotClass(status: StageStatus): string {
  switch (status) {
    case "healthy":
      return "bg-success";
    case "degraded":
      return "bg-warning";
    case "down":
      return "bg-destructive";
    case "external":
      return "bg-primary";
    default:
      return "bg-muted-foreground/50";
  }
}

function StatusIcon({ status }: { status: StageStatus }) {
  const cls = "h-3.5 w-3.5";
  switch (status) {
    case "healthy":
      return <CheckCircle2 className={cn(cls, "text-success")} aria-hidden />;
    case "degraded":
      return <AlertTriangle className={cn(cls, "text-warning")} aria-hidden />;
    case "down":
      return <XCircle className={cn(cls, "text-destructive")} aria-hidden />;
    case "external":
      return <Activity className={cn(cls, "text-primary")} aria-hidden />;
    default:
      return (
        <HelpCircle className={cn(cls, "text-muted-foreground")} aria-hidden />
      );
  }
}

function formatLatency(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1) return "<1ms";
  return `${Math.round(ms)}ms`;
}

// ── Stage node ───────────────────────────────────────────────────────

function StageNode({
  stage,
  runtime,
  reducedMotion,
}: {
  stage: PipelineStage;
  runtime: StageRuntime;
  reducedMotion: boolean;
}) {
  const Icon = stage.icon;
  const isLive = runtime.status === "healthy" || runtime.status === "degraded";
  const isDown = runtime.status === "down";

  return (
    <div
      className="relative flex w-[7.5rem] flex-col items-center sm:w-32"
      role="listitem"
      aria-label={`${stage.name}: ${statusLabel(runtime.status)}${
        runtime.latencyMs != null
          ? `, latency ${formatLatency(runtime.latencyMs)}`
          : ""
      }`}
    >
      {/* Subtle ambient pulse when healthy — disabled under reduce-motion */}
      {isLive && !reducedMotion ? (
        <span
          className={cn(
            "pointer-events-none absolute top-6 h-14 w-14 rounded-2xl opacity-30 blur-md",
            runtime.status === "healthy" ? "bg-success/40" : "bg-warning/40",
            "animate-pulse"
          )}
          aria-hidden
        />
      ) : null}

      <div
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-2xl border-2 transition-colors",
          isDown
            ? "border-destructive/40 bg-destructive/10"
            : isLive
              ? "border-border bg-card shadow-sm"
              : "border-border/60 bg-secondary/40"
        )}
      >
        <Icon
          className={cn(
            "h-6 w-6",
            isDown
              ? "text-destructive"
              : isLive
                ? "text-foreground"
                : "text-muted-foreground"
          )}
          aria-hidden
        />
        <span
          className={cn(
            "absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background",
            statusDotClass(runtime.status),
            isLive && !reducedMotion && "animate-pulse"
          )}
          aria-hidden
        />
      </div>

      <span className="mt-2 text-center text-xs font-semibold text-foreground">
        {stage.shortName}
      </span>
      <span className="text-[10px] text-muted-foreground">{stage.name}</span>

      <Badge
        variant="outline"
        className={cn(
          "mt-1.5 gap-1 border text-[10px]",
          statusBadgeClass(runtime.status)
        )}
      >
        <StatusIcon status={runtime.status} />
        {statusLabel(runtime.status)}
      </Badge>

      <div className="mt-1.5 flex flex-col items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
        <span title="Health-check round-trip">
          RTT {formatLatency(runtime.latencyMs)}
        </span>
        {runtime.analyticsAvgMs != null ? (
          <span title="Analytics Engine avg duration">
            AE {formatLatency(runtime.analyticsAvgMs)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ConnectionArrow({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}) {
  return (
    <div
      className="relative mx-0.5 flex min-w-[1.25rem] flex-1 items-center justify-center sm:min-w-[2rem]"
      aria-hidden
    >
      <div className="absolute h-px w-full bg-border" />
      {active ? (
        <div
          className={cn(
            "absolute h-0.5 w-full rounded-full bg-gradient-to-r from-primary/20 via-primary/70 to-primary/20",
            !reducedMotion && "animate-pulse"
          )}
        />
      ) : null}
      <ArrowRight
        className={cn(
          "relative z-10 h-3.5 w-3.5 shrink-0",
          active ? "text-primary" : "text-muted-foreground/40"
        )}
      />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export function SignalFlowVisualization() {
  const reducedMotion = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerStatuses, setWorkerStatuses] = useState<WorkerStatus[]>([]);
  const [analyticsLatency, setAnalyticsLatency] = useState<
    Record<string, number | null>
  >({});
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const statuses = await api.getWorkersStatus();
      setWorkerStatuses(statuses);

      // Optional Analytics Engine avg latency per mapped worker (best-effort)
      const analyticsWorkers = Array.from(
        new Set(
          PIPELINE_STAGES.map((s) => s.analyticsWorker).filter(
            (w): w is string => Boolean(w)
          )
        )
      );

      const latencyEntries = await Promise.all(
        analyticsWorkers.map(async (worker) => {
          try {
            const url = new URL(
              "/api/analytics/worker-performance",
              window.location.origin
            );
            url.searchParams.set("worker", worker);
            const res = await fetch(url.toString());
            if (!res.ok) return [worker, null] as const;
            const json = (await res.json()) as {
              success: boolean;
              data?: WorkerPerfRow[];
            };
            if (!json.success || !json.data?.length) {
              return [worker, null] as const;
            }
            const avg =
              json.data.reduce(
                (sum, row) => sum + (Number(row.avg_duration_ms) || 0),
                0
              ) / json.data.length;
            return [worker, Number.isFinite(avg) ? avg : null] as const;
          } catch {
            return [worker, null] as const;
          }
        })
      );

      setAnalyticsLatency(Object.fromEntries(latencyEntries));
      setLastRefreshed(Date.now());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load pipeline status"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void load(false);
    const id = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(id);
  }, [mounted, load]);

  const statusByWorker = useMemo(() => {
    const map = new Map<string, WorkerStatus>();
    for (const w of workerStatuses) map.set(w.name, w);
    return map;
  }, [workerStatuses]);

  const stageRuntimes = useMemo(() => {
    const runtimes: Record<string, StageRuntime> = {};

    for (const stage of PIPELINE_STAGES) {
      if (stage.id === "webhook") {
        runtimes[stage.id] = {
          status: "external",
          latencyMs: undefined,
          analyticsAvgMs: null,
        };
        continue;
      }

      if (stage.workerName) {
        const ws = statusByWorker.get(stage.workerName);
        runtimes[stage.id] = {
          status: (ws?.status as StageStatus) ?? "unknown",
          latencyMs: ws?.latency,
          lastCheck: ws?.lastCheck,
          analyticsAvgMs: stage.analyticsWorker
            ? (analyticsLatency[stage.analyticsWorker] ?? null)
            : null,
        };
        continue;
      }

      // Gateway: derive from trade + d1 + telegram reachability
      if (stage.id === "gateway") {
        const deps = ["trade-worker", "d1-worker", "telegram-worker"]
          .map((n) => statusByWorker.get(n)?.status)
          .filter(Boolean) as Array<"healthy" | "degraded" | "down">;
        let status: StageStatus = "unknown";
        if (deps.length > 0) {
          if (deps.every((s) => s === "healthy")) status = "healthy";
          else if (deps.some((s) => s === "down")) status = "degraded";
          else if (deps.some((s) => s === "degraded")) status = "degraded";
          else status = "healthy";
        }
        const latencies = ["trade-worker", "d1-worker"]
          .map((n) => statusByWorker.get(n)?.latency)
          .filter((n): n is number => typeof n === "number");
        runtimes[stage.id] = {
          status,
          latencyMs:
            latencies.length > 0
              ? Math.round(
                  latencies.reduce((a, b) => a + b, 0) / latencies.length
                )
              : undefined,
          analyticsAvgMs: analyticsLatency.hoox ?? null,
        };
        continue;
      }

      runtimes[stage.id] = { status: "unknown" };
    }

    return runtimes;
  }, [statusByWorker, analyticsLatency]);

  const summary = useMemo(() => {
    const values = Object.values(stageRuntimes);
    return {
      healthy: values.filter((v) => v.status === "healthy").length,
      degraded: values.filter((v) => v.status === "degraded").length,
      down: values.filter((v) => v.status === "down").length,
      unknown: values.filter(
        (v) => v.status === "unknown" || v.status === "external"
      ).length,
    };
  }, [stageRuntimes]);

  // Linear spine for desktop: webhook → gateway → (trade|agent) → d1 → telegram
  // We render trade+agent as a stacked pair in the middle.
  const spineLeft = PIPELINE_STAGES.filter((s) =>
    ["webhook", "gateway"].includes(s.id)
  );
  const branchStages = PIPELINE_STAGES.filter((s) =>
    ["trade", "agent"].includes(s.id)
  );
  const spineRight = PIPELINE_STAGES.filter((s) =>
    ["d1", "telegram"].includes(s.id)
  );

  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">
                Signal Flow Pipeline
              </CardTitle>
              <CardDescription>
                Live path of a trade signal from ingest through execution,
                persistence, and notification. Status comes from worker health
                checks; latency is measured RTT (and Analytics Engine averages
                when available).
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 border-success/30 text-success"
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {summary.healthy} healthy
              </Badge>
              {summary.degraded > 0 ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-warning/30 text-warning"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {summary.degraded} degraded
                </Badge>
              ) : null}
              {summary.down > 0 ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-destructive/30 text-destructive"
                >
                  <XCircle className="h-3 w-3" aria-hidden />
                  {summary.down} down
                </Badge>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void load(true)}
                disabled={loading || refreshing}
                aria-label="Refresh pipeline status"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    (loading || refreshing) && "animate-spin"
                  )}
                />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {error ? (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Pipeline status unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <div
              className="space-y-4"
              aria-busy="true"
              aria-label="Loading pipeline"
            >
              <Skeleton className="h-40 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop / tablet pipeline */}
              <div
                className="relative hidden rounded-xl border border-border bg-secondary/20 p-4 md:p-6 lg:block"
                role="list"
                aria-label="Signal processing stages"
              >
                <div className="flex items-center justify-between gap-1">
                  {spineLeft.map((stage) => (
                    <div key={stage.id} className="flex flex-1 items-center">
                      <StageNode
                        stage={stage}
                        runtime={stageRuntimes[stage.id]}
                        reducedMotion={reducedMotion}
                      />
                      <ConnectionArrow
                        active={
                          stageRuntimes[stage.id]?.status === "healthy" ||
                          stageRuntimes[stage.id]?.status === "external" ||
                          stageRuntimes[stage.id]?.status === "degraded"
                        }
                        reducedMotion={reducedMotion}
                      />
                    </div>
                  ))}

                  {/* Parallel trade / agent branch */}
                  <div className="flex flex-col items-center gap-3 px-1">
                    {branchStages.map((stage) => (
                      <StageNode
                        key={stage.id}
                        stage={stage}
                        runtime={stageRuntimes[stage.id]}
                        reducedMotion={reducedMotion}
                      />
                    ))}
                  </div>

                  <ConnectionArrow
                    active={
                      stageRuntimes.trade?.status === "healthy" ||
                      stageRuntimes.agent?.status === "healthy" ||
                      stageRuntimes.d1?.status === "healthy"
                    }
                    reducedMotion={reducedMotion}
                  />

                  {spineRight.map((stage, index) => (
                    <div key={stage.id} className="flex flex-1 items-center">
                      <StageNode
                        stage={stage}
                        runtime={stageRuntimes[stage.id]}
                        reducedMotion={reducedMotion}
                      />
                      {index < spineRight.length - 1 ? (
                        <ConnectionArrow
                          active={
                            stageRuntimes[stage.id]?.status === "healthy" ||
                            stageRuntimes[stage.id]?.status === "degraded"
                          }
                          reducedMotion={reducedMotion}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-center text-[11px] text-muted-foreground">
                  Trade and Agent run in parallel after the gateway; both write
                  through D1 before Telegram notifies operators.
                </p>
              </div>

              {/* Mobile stacked pipeline */}
              <ol
                className="flex flex-col gap-0 rounded-xl border border-border bg-secondary/20 p-3 lg:hidden"
                aria-label="Signal processing stages"
              >
                {PIPELINE_STAGES.map((stage, index) => {
                  const runtime = stageRuntimes[stage.id];
                  const Icon = stage.icon;
                  return (
                    <li key={stage.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2",
                            runtime?.status === "down"
                              ? "border-destructive/40 bg-destructive/10"
                              : "border-border bg-card"
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </div>
                        {index < PIPELINE_STAGES.length - 1 ? (
                          <div
                            className={cn(
                              "my-1 w-px flex-1 min-h-[1.25rem]",
                              runtime?.status === "healthy" ||
                                runtime?.status === "external"
                                ? "bg-primary/50"
                                : "bg-border"
                            )}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      <div className="pb-4 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {stage.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "border text-[10px]",
                              statusBadgeClass(runtime?.status ?? "unknown")
                            )}
                          >
                            {statusLabel(runtime?.status ?? "unknown")}
                          </Badge>
                          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                            {formatLatency(runtime?.latencyMs)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {stage.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Stage detail cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PIPELINE_STAGES.map((stage, index) => {
                  const runtime = stageRuntimes[stage.id];
                  const Icon = stage.icon;
                  return (
                    <motion.div
                      key={stage.id}
                      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : { duration: 0.25, delay: index * 0.04 }
                      }
                      className={cn(
                        "rounded-lg border p-3",
                        runtime?.status === "down"
                          ? "border-destructive/30 bg-destructive/5"
                          : runtime?.status === "degraded"
                            ? "border-warning/30 bg-warning/5"
                            : "border-border bg-secondary/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden
                          />
                          <div>
                            <p className="text-sm font-medium">{stage.name}</p>
                            {stage.workerName ? (
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {stage.workerName}
                              </p>
                            ) : (
                              <p className="text-[10px] text-muted-foreground">
                                {stage.id === "webhook"
                                  ? "External input"
                                  : "hoox gateway"}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 border text-[10px]",
                            statusBadgeClass(runtime?.status ?? "unknown")
                          )}
                        >
                          {statusLabel(runtime?.status ?? "unknown")}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {stage.description}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
                        <span>RTT {formatLatency(runtime?.latencyMs)}</span>
                        <span>
                          AE avg {formatLatency(runtime?.analyticsAvgMs)}
                        </span>
                      </div>
                      {stage.services.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {stage.services.map((service) => (
                            <CFServiceBadge
                              key={service}
                              service={service}
                              isActive={
                                runtime?.status === "healthy" ||
                                runtime?.status === "degraded"
                              }
                              mini
                            />
                          ))}
                        </div>
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          {/* Legend + operator links */}
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary/10 p-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Legend
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {(
                  [
                    "healthy",
                    "degraded",
                    "down",
                    "external",
                    "unknown",
                  ] as StageStatus[]
                ).map((s) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span
                      className={cn("h-2 w-2 rounded-full", statusDotClass(s))}
                      aria-hidden
                    />
                    {statusLabel(s)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
                <strong className="font-medium text-foreground">RTT</strong> is
                the dashboard health-check round-trip.{" "}
                <strong className="font-medium text-foreground">AE</strong> is
                average duration from Analytics Engine worker-performance when
                credentials and data exist. Missing AE values are shown as —
                (not zero).
              </p>
              {lastRefreshed ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Last refreshed{" "}
                  <time dateTime={new Date(lastRefreshed).toISOString()}>
                    {new Date(lastRefreshed).toLocaleTimeString()}
                  </time>
                  {" · "}auto every 30s
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href="/dashboard/logs">
                  <ScrollText className="h-3.5 w-3.5" aria-hidden />
                  System logs
                  <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href="/dashboard/positions">
                  <ChartCandlestick className="h-3.5 w-3.5" aria-hidden />
                  Positions
                  <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href="/dashboard/signals">
                  <Webhook className="h-3.5 w-3.5" aria-hidden />
                  Signals
                  <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
