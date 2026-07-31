/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
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
import { Network, TrendingDown, TrendingUp, Minus } from "lucide-react";
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

interface ApiStatRow {
  endpoint: string;
  worker?: string;
  call_count: number;
  success_count: number;
  avg_latency_ms: number;
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
] as const;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalize(rows: ApiStatRow[]): ApiStatRow[] {
  return rows
    .map((r) => ({
      endpoint: String(r.endpoint || "unknown"),
      worker: r.worker ? String(r.worker) : undefined,
      call_count: num(r.call_count),
      success_count: num(r.success_count),
      avg_latency_ms: num(r.avg_latency_ms),
    }))
    .filter((r) => r.call_count > 0)
    .sort((a, b) => b.call_count - a.call_count);
}

function successRate(row: ApiStatRow): number {
  if (row.call_count <= 0) return 0;
  return (row.success_count / row.call_count) * 100;
}

function latencyTone(ms: number): string {
  if (ms > 500) return "text-destructive font-medium";
  if (ms > 200) return "text-warning";
  return "text-muted-foreground";
}

function healthBadge(rate: number) {
  if (rate >= 95) {
    return (
      <Badge variant="secondary" className="gap-1">
        <TrendingUp className="size-3" />
        Good
      </Badge>
    );
  }
  if (rate >= 80) {
    return (
      <Badge variant="outline" className="gap-1">
        <Minus className="size-3" />
        Fair
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <TrendingDown className="size-3" />
      Poor
    </Badge>
  );
}

export function ApiStats({
  timeRange = "7d",
  className,
}: {
  timeRange?: TimeRangeKey;
  className?: string;
}) {
  const [worker, setWorker] = useState<string>("all");

  const url = useMemo(() => {
    const u = new URL(
      "/api/analytics/api-stats",
      typeof window !== "undefined" ? window.location.origin : "http://local"
    );
    if (worker !== "all") {
      u.searchParams.set("worker", worker);
    }
    appendTimeRangeParams(u, timeRange, { end: false });
    return u.pathname + u.search;
  }, [worker, timeRange]);

  const { data, loading, error, refetch } = useAnalyticsQuery<ApiStatRow[]>(
    url,
    { select: normalize }
  );

  if (loading && !data) {
    return <AnalyticsCardSkeleton height="h-[220px]" className={className} />;
  }

  const rows = data ?? [];
  const totalCalls = rows.reduce((s, r) => s + r.call_count, 0);
  const avgLatency =
    totalCalls > 0
      ? rows.reduce((s, r) => s + r.avg_latency_ms * r.call_count, 0) /
        totalCalls
      : 0;

  return (
    <AnalyticsCard
      title="API Call Statistics"
      description={
        rows.length > 0
          ? `${totalCalls.toLocaleString()} calls · ~${Math.round(avgLatency)} ms avg · ${timeRangeLabel(timeRange)}`
          : `Latency and success by endpoint · ${timeRangeLabel(timeRange)}`
      }
      icon={Network}
      className={className}
      info={
        <div className="space-y-1.5">
          <p>
            Each row is an outbound/inbound API path tracked via{" "}
            <strong>api-call</strong> events (endpoint + worker).
          </p>
          <p>
            Latency: green-ish under 200&nbsp;ms, caution 200–500&nbsp;ms, alert
            above 500&nbsp;ms. Success rate Good ≥95%, Fair ≥80%.
          </p>
        </div>
      }
      action={
        <Select value={worker} onValueChange={setWorker}>
          <SelectTrigger
            className="w-[160px]"
            size="sm"
            aria-label="Filter by worker"
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
        <AnalyticsTableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <AnalyticsEmpty
          title="No API call samples"
          description="Workers emit /track/api-call events with endpoint and latency. Once instrumented traffic flows, endpoints rank here by volume."
          compact
        />
      ) : (
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    Avg latency
                    <MetricInfo label="Latency">
                      Average round-trip time in milliseconds for this endpoint
                      (double1 on api-call samples).
                    </MetricInfo>
                  </span>
                </TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const rate = successRate(row);
                const latency = Math.round(row.avg_latency_ms);
                return (
                  <TableRow key={`${row.worker}-${row.endpoint}-${i}`}>
                    <TableCell className="max-w-[200px] truncate font-mono text-sm font-medium">
                      {row.endpoint}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {row.worker || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.call_count.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        latencyTone(latency)
                      )}
                    >
                      {latency > 0 ? `${latency} ms` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rate.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {healthBadge(rate)}
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
