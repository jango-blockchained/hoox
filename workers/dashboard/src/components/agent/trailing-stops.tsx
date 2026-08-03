"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HooxIcon } from "@/components/ui/hoox-icon";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export interface TrailingStopRow {
  key: string;
  exchange: string;
  symbol: string;
  side: string;
  watermark: number | null;
}

interface StatusResponse {
  success: boolean;
  status?: {
    stops?: TrailingStopRow[];
    activeStops?: number;
  };
  error?: string;
}

interface TrailingStopsProps {
  /** When provided, skips internal fetch and renders these rows. */
  stops?: TrailingStopRow[];
  loading?: boolean;
  onRefresh?: () => void;
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value >= 1
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `$${value.toPrecision(4)}`;
}

export function TrailingStops({
  stops: controlledStops,
  loading: controlledLoading,
  onRefresh,
}: TrailingStopsProps = {}) {
  const isControlled = controlledStops !== undefined;
  const [stops, setStops] = useState<TrailingStopRow[]>(controlledStops ?? []);
  const [loading, setLoading] = useState(!isControlled);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStops = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/agent/status", { signal });
      const data = (await res.json()) as StatusResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load trailing stops");
      }
      setStops(data.status?.stops ?? []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(
        e instanceof Error ? e.message : "Failed to load trailing stops"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isControlled) {
      setStops(controlledStops ?? []);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void fetchStops(controller.signal);
    return () => controller.abort();
  }, [isControlled, controlledStops, fetchStops]);

  const displayStops = isControlled ? (controlledStops ?? []) : stops;
  const displayLoading = isControlled ? Boolean(controlledLoading) : loading;

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
      return;
    }
    setRefreshing(true);
    void fetchStops();
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Active Trailing Stops</CardTitle>
          <CardDescription>
            Watermarks monitored by the agent worker
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={displayLoading || refreshing}
          aria-label="Refresh trailing stops"
        >
          <HooxIcon
            name="refresh"
            size="sm"
            className={refreshing ? "animate-spin" : ""}
          />
        </Button>
      </CardHeader>
      <CardContent>
        {displayLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : displayStops.length === 0 ? (
          <Empty className="min-h-[160px] border border-dashed py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Activity className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No active trailing stops</EmptyTitle>
              <EmptyDescription>
                Watermarks appear here when the agent tracks open positions.
                Ensure the agent worker is running and has positions with
                trailing stops enabled.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Exchange</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Watermark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayStops.map((stop) => {
                const isLong = stop.side.toUpperCase() === "LONG";
                return (
                  <TableRow key={stop.key}>
                    <TableCell className="font-medium">{stop.symbol}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {stop.exchange}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isLong ? "default" : "destructive"}>
                        {isLong ? (
                          <TrendingUp className="mr-1 h-3 w-3" aria-hidden />
                        ) : (
                          <TrendingDown className="mr-1 h-3 w-3" aria-hidden />
                        )}
                        {stop.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-destructive">
                      {formatPrice(stop.watermark)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
