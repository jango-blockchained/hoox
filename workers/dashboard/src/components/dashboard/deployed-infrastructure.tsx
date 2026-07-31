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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw, Server } from "lucide-react";
import {
  INFRASTRUCTURE_SECTIONS,
  type InfrastructureResource,
  type ResourceStatus,
} from "./infrastructure/infrastructure-config";
import { InfrastructureRow } from "./infrastructure/infrastructure-row";
import { InfrastructureLegend } from "./infrastructure/infrastructure-legend";
import { cn } from "@/lib/utils";

interface HealthApiWorker {
  kvReachable: boolean;
  lastChecked: number;
  error?: string;
}

function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

/**
 * Overlay live CONFIG_KV health onto static infrastructure catalog for workers.
 * Pages/storage keep catalog status (we have no live probe for them yet).
 */
function mergeHealth(
  resources: InfrastructureResource[],
  health: Record<string, HealthApiWorker> | null
): InfrastructureResource[] {
  if (!health) return resources;
  return resources.map((r) => {
    if (r.kind !== "worker") return r;
    // Catalog uses web3-wallet-worker; health list matches DEFAULT_WORKER_LIST
    const h = health[r.name];
    if (!h)
      return {
        ...r,
        status: "inactive" as ResourceStatus,
        healthError: "No health sample",
      };
    return {
      ...r,
      status: (h.kvReachable ? "active" : "inactive") as ResourceStatus,
      healthError: h.error,
      lastChecked: h.lastChecked,
    };
  });
}

export function DeployedInfrastructure() {
  const [health, setHealth] = useState<Record<string, HealthApiWorker> | null>(
    null
  );
  const [lastCheckAt, setLastCheckAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/workers/health", { signal });
      if (res.ok) {
        const data = (await res.json()) as {
          workers: Record<string, HealthApiWorker>;
        };
        setHealth(data.workers ?? {});
      }
      setLastCheckAt(Date.now());
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setLastCheckAt(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const id = setInterval(() => void load(), 45_000);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [load]);

  const sections = useMemo(() => {
    return INFRASTRUCTURE_SECTIONS.map((section) => ({
      ...section,
      resources: mergeHealth(section.resources, health),
    }));
  }, [health]);

  const totals = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let total = 0;
    for (const s of sections) {
      for (const r of s.resources) {
        total++;
        if (r.status === "active") active++;
        else inactive++;
      }
    }
    return { active, inactive, total };
  }, [sections]);

  return (
    <Card className="border-border bg-card shadow-2xl shadow-primary/5 backdrop-blur-xl">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server strokeWidth={1.5} className="size-4 text-foreground/80" />
            <CardTitle className="text-base">
              Cloudflare Infrastructure
            </CardTitle>
            <span className="text-muted-foreground text-[10px] tracking-[0.08em] uppercase">
              Edge Network
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="font-normal text-[10px] tabular-nums"
            >
              {totals.active}/{totals.total} active
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => void load()}
              disabled={refreshing}
              aria-label="Refresh infrastructure health"
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
            </Button>
          </div>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span>
            Deployed serverless functions, pages, and storage backends
          </span>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1 text-[11px]">
            <Clock className="size-3" />
            Last check {relativeTime(lastCheckAt)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid divide-y divide-border lg:grid-cols-[1fr_400px] lg:divide-x lg:divide-y-0">
          <div className="flex flex-col divide-y divide-border">
            {sections.map((section) => {
              const Icon = section.icon;
              const activeCount = section.resources.filter(
                (r) => r.status === "active"
              ).length;
              return (
                <div
                  key={section.title}
                  className="flex flex-col gap-4 p-4"
                  aria-labelledby={`infra-section-${section.title}`}
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium tracking-tight text-foreground/80">
                    <Icon strokeWidth={1.5} className="size-4" />
                    <span id={`infra-section-${section.title}`}>
                      {section.title}
                    </span>
                    <Separator
                      orientation="horizontal"
                      className="ml-2 flex-1"
                    />
                    <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
                      {activeCount}/{section.resources.length} up
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {section.resources.map((resource) => (
                      <InfrastructureRow
                        key={resource.name}
                        resource={resource}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <InfrastructureLegend />
        </div>
      </CardContent>
    </Card>
  );
}
