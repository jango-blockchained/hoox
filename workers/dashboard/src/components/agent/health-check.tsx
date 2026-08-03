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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HooxIcon } from "@/components/ui/hoox-icon";
import { HeartPulse } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ProviderHealth {
  name: string;
  healthy: boolean;
  latency?: number;
  error?: string;
}

export function HealthCheck() {
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const fetchHealth = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    try {
      const res = await fetch("/api/agent/health", { signal });
      const data = (await res.json()) as {
        success: boolean;
        providers?: Record<
          string,
          { healthy: boolean; latency?: number; error?: string }
        >;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch health status");
      }
      if (data.providers) {
        setProviders(
          Object.entries(data.providers).map(([name, info]) => ({
            name,
            healthy: info.healthy,
            latency: info.latency,
            error: info.error,
          }))
        );
      } else {
        setProviders([]);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(
        e instanceof Error ? e.message : "Failed to fetch health status"
      );
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchHealth(controller.signal);
    return () => controller.abort();
  }, [fetchHealth]);

  const healthyCount = providers.filter((p) => p.healthy).length;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Health Check</CardTitle>
          <CardDescription>
            AI provider health status
            {!loading && providers.length > 0 && (
              <span className="ml-1">
                · {healthyCount}/{providers.length} healthy
              </span>
            )}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchHealth()}
          disabled={checking}
          aria-label="Refresh health check"
        >
          <HooxIcon
            name="refresh"
            size="sm"
            className={checking ? "animate-spin" : ""}
            data-icon="inline-end"
          />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : providers.length === 0 ? (
          <Empty className="min-h-[140px] border border-dashed py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HeartPulse className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No providers reported</EmptyTitle>
              <EmptyDescription>
                Run a health check to probe configured AI providers.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant={p.healthy ? "default" : "destructive"}>
                      {p.healthy ? "Healthy" : "Error"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {p.latency != null ? `${p.latency}ms` : "—"}
                  </TableCell>
                  <TableCell>
                    {p.error ? (
                      <span className="line-clamp-2 text-sm text-destructive">
                        {p.error}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">OK</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
