/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
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

interface SignalOutcomeRow {
  source: string;
  signal_type: string;
  symbol: string;
  signal_count: number;
  avg_confidence: number;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalize(rows: SignalOutcomeRow[]): SignalOutcomeRow[] {
  return rows
    .map((r) => ({
      source: String(r.source || "unknown"),
      signal_type: String(r.signal_type || "—"),
      symbol: String(r.symbol || "—"),
      signal_count: num(r.signal_count),
      // Confidence may arrive 0–1 or already 0–100 depending on producers.
      avg_confidence: (() => {
        const c = num(r.avg_confidence);
        return c > 1 ? c / 100 : c;
      })(),
    }))
    .filter((r) => r.signal_count > 0)
    .sort((a, b) => b.signal_count - a.signal_count);
}

function confidenceClass(c: number): string {
  if (c >= 0.7) return "text-success font-medium";
  if (c >= 0.4) return "text-warning";
  return "text-destructive";
}

function typeVariant(
  type: string
): "default" | "secondary" | "outline" | "destructive" {
  const t = type.toLowerCase();
  if (t.includes("long") || t.includes("buy")) return "default";
  if (t.includes("short") || t.includes("sell")) return "secondary";
  if (t.includes("close") || t.includes("exit")) return "outline";
  return "outline";
}

export function SignalOutcomes({
  timeRange = "30d",
  className,
}: {
  timeRange?: TimeRangeKey;
  className?: string;
}) {
  const url = useMemo(() => {
    const u = new URL(
      "/api/analytics/signals",
      typeof window !== "undefined" ? window.location.origin : "http://local"
    );
    appendTimeRangeParams(u, timeRange, { end: false });
    return u.pathname + u.search;
  }, [timeRange]);

  const { data, loading, error, refetch } = useAnalyticsQuery<
    SignalOutcomeRow[]
  >(url, { select: normalize });

  if (loading && !data) {
    return <AnalyticsCardSkeleton height="h-[220px]" className={className} />;
  }

  const rows = data ?? [];
  const totalSignals = rows.reduce((s, r) => s + r.signal_count, 0);
  const sources = new Set(rows.map((r) => r.source)).size;

  return (
    <AnalyticsCard
      title="Signal Outcomes"
      description={
        rows.length > 0
          ? `${totalSignals.toLocaleString()} signals · ${sources} source${sources === 1 ? "" : "s"} · ${timeRangeLabel(timeRange)}`
          : `Distribution by source, type, and symbol · ${timeRangeLabel(timeRange)}`
      }
      icon={Zap}
      className={className}
      info={
        <div className="space-y-1.5">
          <p>
            Ingested trading signals grouped by source, type, and symbol.
            Confidence is the average model/source score (0–100% display).
          </p>
          <p>
            High confidence (≥70%) is highlighted. Low confidence clusters may
            need prompt or filter tuning on the agent-worker.
          </p>
        </div>
      }
    >
      {error && rows.length === 0 ? (
        <AnalyticsErrorState error={error} onRetry={refetch} compact />
      ) : loading ? (
        <AnalyticsTableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <AnalyticsEmpty
          title="No signals tracked"
          description="Signals appear when producers call analytics-worker /track/signal. Check webhook intake and agent-worker signal publishing."
          compact
        />
      ) : (
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    Avg confidence
                    <MetricInfo label="Confidence">
                      Mean confidence score attached to signals (double1).
                      Values are normalized to a 0–100% scale for display.
                    </MetricInfo>
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={`${row.source}-${row.signal_type}-${row.symbol}-${i}`}
                >
                  <TableCell className="font-medium">{row.source}</TableCell>
                  <TableCell>
                    <Badge variant={typeVariant(row.signal_type)}>
                      {row.signal_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.symbol}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.signal_count.toLocaleString()}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      confidenceClass(row.avg_confidence)
                    )}
                  >
                    {(row.avg_confidence * 100).toFixed(0)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </AnalyticsCard>
  );
}
