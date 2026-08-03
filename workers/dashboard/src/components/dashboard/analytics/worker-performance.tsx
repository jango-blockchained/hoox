/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  AnalyticsCard,
  AnalyticsCardSkeleton,
  AnalyticsEmpty,
  AnalyticsErrorState,
  AnalyticsTableSkeleton,
  MetricInfo,
} from "./analytics-shell";
import {
  appendTimeRangeParams,
  timeRangeLabel,
  type TimeRangeKey,
} from "./time-range";
import { useAnalyticsQuery } from "./use-analytics-query";
import { cn } from "@/lib/utils";

interface WorkerPerformanceRow {
  worker: string;
  data_type?: string;
  total_requests: number;
  total_errors: number;
  avg_duration_ms: number;
}

const WORKER_FILTERS = [
  "all",
  "trade-worker",
  "agent-worker",
  "d1-worker",
  "telegram-worker",
  "hoox",
  "analytics-worker",
  "email-worker",
  "web3-wallet-worker",
  "report-worker",
] as const;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalize(rows: WorkerPerformanceRow[]): WorkerPerformanceRow[] {
  return rows
    .map((r) => ({
      worker: String(r.worker || "unknown"),
      data_type: r.data_type ? String(r.data_type) : "worker-perf",
      total_requests: num(r.total_requests),
      total_errors: num(r.total_errors),
      avg_duration_ms: num(r.avg_duration_ms),
    }))
    .sort((a, b) => b.total_requests - a.total_requests);
}

function errorRate(row: WorkerPerformanceRow): number {
  if (row.total_requests <= 0) return 0;
  return (row.total_errors / row.total_requests) * 100;
}

function statusFor(
  row: WorkerPerformanceRow
): "healthy" | "degraded" | "critical" {
  const rate = errorRate(row);
  if (rate >= 5 || row.total_errors > 50) return "critical";
  if (rate > 0 || row.avg_duration_ms > 2000) return "degraded";
  return "healthy";
}

export function WorkerPerformance({
  timeRange = "7d",
  className,
}: {
  timeRange?: TimeRangeKey;
  className?: string;
}) {
  const [selectedWorker, setSelectedWorker] = useState<string>("all");

  const url = useMemo(() => {
    const u = new URL(
      "/api/analytics/worker-performance",
      typeof window !== "undefined" ? window.location.origin : "http://local"
    );
    if (selectedWorker !== "all") {
      u.searchParams.set("worker", selectedWorker);
    } else {
      u.searchParams.set("worker", "all");
    }
    appendTimeRangeParams(u, timeRange, { end: false });
    return u.pathname + u.search;
  }, [selectedWorker, timeRange]);

  const { data, loading, error, refetch } = useAnalyticsQuery<
    WorkerPerformanceRow[]
  >(url, { select: normalize });

  if (loading && !data) {
    return <AnalyticsCardSkeleton height="h-[220px]" className={className} />;
  }

  const rows = data ?? [];

  return (
    <AnalyticsCard
      title="Worker Performance"
      description={`Request volume, errors, and latency · ${timeRangeLabel(timeRange)}`}
      icon={Activity}
      className={className}
      info={
        <div className="space-y-1.5">
          <p>
            Aggregated from <strong>worker-perf</strong> heartbeats. Requests
            and errors are summed; duration is the average reported cycle time.
          </p>
          <p>
            Status: Healthy (no errors), Degraded (any errors or slow &gt;2s),
            Critical (≥5% error rate or many errors).
          </p>
        </div>
      }
      action={
        <Select value={selectedWorker} onValueChange={setSelectedWorker}>
          <SelectTrigger
            className="w-[160px]"
            size="sm"
            aria-label="Filter worker"
          >
            <SelectValue placeholder="Worker" />
          </SelectTrigger>
          <SelectContent>
            {WORKER_FILTERS.map((w) => (
              <SelectItem key={w} value={w}>
                {w === "all" ? "All workers" : w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {error && rows.length === 0 ? (
        <AnalyticsErrorState error={error} onRetry={refetch} compact />
      ) : loading ? (
        <AnalyticsTableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <AnalyticsEmpty
          title="No worker heartbeats"
          description="Workers publish performance samples via analytics-worker /track/worker-perf. Enable tracking on each worker to populate this table."
          compact
        />
      ) : (
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Worker
                    <MetricInfo label="Worker">
                      Service name that reported the sample (blob2).
                    </MetricInfo>
                  </span>
                </TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    Avg duration
                    <MetricInfo label="Avg duration">
                      Mean duration (ms) reported per heartbeat. High values can
                      indicate queue backlog or cold starts.
                    </MetricInfo>
                  </span>
                </TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = statusFor(row);
                return (
                  <TableRow key={row.worker}>
                    <TableCell className="font-medium font-mono text-sm">
                      {row.worker}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.total_requests.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        row.total_errors > 0 && "text-destructive font-medium"
                      )}
                    >
                      {row.total_errors.toLocaleString()}
                      {row.total_requests > 0 && row.total_errors > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({errorRate(row).toFixed(1)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.avg_duration_ms > 0
                        ? `${Math.round(row.avg_duration_ms).toLocaleString()} ms`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {status === "critical" ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="size-3" />
                          Critical
                        </Badge>
                      ) : status === "degraded" ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-warning/50 text-warning"
                        >
                          <AlertTriangle className="size-3" />
                          Degraded
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="size-3" />
                          Healthy
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </AnalyticsCard>
  );
}
