"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AgentSubnav,
  KillSwitch,
  RiskParameters,
  TrailingStops,
} from "@/components/agent";
import { PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface AgentStatusResponse {
  success: boolean;
  status?: { killSwitch?: boolean };
  error?: string;
}

interface KillSwitchResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default function RiskClient() {
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/agent/status", { signal });
      const data = (await res.json()) as AgentStatusResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch status");
      }
      setKillSwitchActive(data.status?.killSwitch || false);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(e instanceof Error ? e.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal);
    return () => controller.abort();
  }, [fetchStatus]);

  const handleToggleKillSwitch = async (
    action: "engage_kill_switch" | "release_kill_switch"
  ) => {
    const res = await fetch("/api/agent/risk-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json()) as KillSwitchResponse;
    if (!data.success) {
      const msg = data.error || "Action failed";
      toast.error(msg);
      throw new Error(msg);
    }
    toast.success(data.message ?? "Kill switch updated");
    await fetchStatus();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Shield className="h-8 w-8 text-primary" />}
        title="Risk Management"
        description="Parameters, kill switch, and trailing stops"
      />
      <AgentSubnav />

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <KillSwitch
              active={killSwitchActive}
              onToggle={handleToggleKillSwitch}
            />
            <RiskParameters />
          </div>
          <TrailingStops />
        </div>
      )}
    </div>
  );
}
