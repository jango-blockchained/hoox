"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AgentSubnav,
  UsageChart,
  UsageTable,
  parseUsage,
  type ProviderUsage,
} from "@/components/agent";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { BarChart3, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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

export default function UsageClient() {
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fetchUsage = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/agent/usage", { signal });
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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUsage(controller.signal);
    return () => controller.abort();
  }, [fetchUsage]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={<BarChart3 className="h-8 w-8 text-primary" />}
          title="Usage Statistics"
          description="AI API consumption by provider"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRefreshing(true);
            void fetchUsage();
          }}
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
      <UsageChart providers={providers} loading={loading} note={note} />
      <UsageTable providers={providers} loading={loading} note={note} />
    </div>
  );
}
