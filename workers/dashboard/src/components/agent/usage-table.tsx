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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export interface ProviderUsage {
  name: string;
  requests: number;
  tokens: number;
  avgLatency?: number;
  cost: number;
}

interface UsageApiResponse {
  success: boolean;
  usage?: Record<
    string,
    {
      requests?: number;
      tokens?: number;
      cost?: number;
      avgLatency?: number;
    }
  >;
  note?: string;
  error?: string;
}

function parseUsage(usage: UsageApiResponse["usage"]): ProviderUsage[] {
  if (!usage) return [];
  return Object.entries(usage)
    .map(([name, stats]) => ({
      name,
      requests: Number(stats?.requests ?? 0),
      tokens: Number(stats?.tokens ?? 0),
      cost: Number(stats?.cost ?? 0),
      avgLatency:
        stats?.avgLatency != null ? Number(stats.avgLatency) : undefined,
    }))
    .filter((p) => p.requests > 0 || p.tokens > 0 || p.cost > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

interface UsageTableProps {
  /** Shared usage rows from parent; when omitted, fetches /api/agent/usage. */
  providers?: ProviderUsage[];
  loading?: boolean;
  note?: string | null;
}

export function UsageTable({
  providers: controlledProviders,
  loading: controlledLoading,
  note: controlledNote,
}: UsageTableProps = {}) {
  const isControlled = controlledProviders !== undefined;
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [loading, setLoading] = useState(!isControlled);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (isControlled) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/agent/usage", {
          signal: controller.signal,
        });
        const data = (await res.json()) as UsageApiResponse;
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to load usage");
        }
        setProviders(parseUsage(data.usage));
        setNote(data.note ?? null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error(e instanceof Error ? e.message : "Failed to load usage");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isControlled]);

  const rows = isControlled ? (controlledProviders ?? []) : providers;
  const isLoading = isControlled ? Boolean(controlledLoading) : loading;
  const displayNote = isControlled ? controlledNote : note;

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, p) => ({
        requests: acc.requests + p.requests,
        tokens: acc.tokens + p.tokens,
        cost: acc.cost + p.cost,
      }),
      { requests: 0, tokens: 0, cost: 0 }
    );
  }, [rows]);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">Provider Breakdown</CardTitle>
        <CardDescription>
          Usage statistics by provider
          {displayNote ? (
            <span className="mt-1 block text-xs text-muted-foreground/80">
              {displayNote}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ) : rows.length === 0 ? (
          <Empty className="min-h-[180px] border border-dashed py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BarChart3 className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No usage recorded</EmptyTitle>
              <EmptyDescription>
                {displayNote ||
                  "Provider usage will appear once the agent worker records API metrics."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-2xl font-bold">
                  {totals.requests.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total Requests</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-2xl font-bold">
                  {totals.tokens.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total Tokens</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-2xl font-bold">${totals.cost.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Est. Cost</p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Avg Latency</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((provider) => (
                  <TableRow key={provider.name}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{provider.name}</Badge>
                    </TableCell>
                    <TableCell>{provider.requests.toLocaleString()}</TableCell>
                    <TableCell>{provider.tokens.toLocaleString()}</TableCell>
                    <TableCell>
                      {provider.avgLatency != null
                        ? `${provider.avgLatency}ms`
                        : "—"}
                    </TableCell>
                    <TableCell>${provider.cost.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { parseUsage };
