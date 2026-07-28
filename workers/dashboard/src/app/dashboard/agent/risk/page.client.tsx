"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { KillSwitch } from "@/components/agent/kill-switch";
import { RiskParameters } from "@/components/agent/risk-parameters";
import { TrailingStops } from "@/components/agent/trailing-stops";
import { PageHeader } from "@/components/dashboard/page-header";
import { Shield } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { toast } from "sonner";

interface AgentStatusResponse {
  success: boolean;
  status?: { killSwitch?: boolean };
}

interface KillSwitchResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default function RiskClient() {
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/agent/status", { signal });
      const data = (await res.json()) as AgentStatusResponse;
      if (data.success) {
        setKillSwitchActive(data.status?.killSwitch || false);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Failed to fetch status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchStatus(controller.signal);
    return () => controller.abort();
  }, []);

  const handleToggleKillSwitch = async (
    action: "engage_kill_switch" | "release_kill_switch"
  ) => {
    try {
      const res = await fetch("/api/agent/risk-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as KillSwitchResponse;
      if (data.success) {
        toast.success(data.message);
        fetchStatus();
      } else {
        toast.error(data.error || "Action failed");
      }
    } catch {
      toast.error("Failed to toggle kill switch");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Shield className="h-8 w-8 text-primary" />}
        title="Risk Management"
        description="Parameters & overrides"
      />

      {loading ? (
        <div className="flex flex-col gap-4">
          <div className="h-32 bg-secondary/30 rounded-lg animate-pulse" />
          <div className="h-64 bg-secondary/30 rounded-lg animate-pulse" />
          <div className="h-48 bg-secondary/30 rounded-lg animate-pulse" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Suspense
              fallback={
                <div className="h-32 animate-pulse rounded-lg bg-muted" />
              }
            >
              <KillSwitch
                active={killSwitchActive}
                onToggle={handleToggleKillSwitch}
              />
            </Suspense>
            <Suspense
              fallback={
                <div className="h-64 animate-pulse rounded-lg bg-muted" />
              }
            >
              <RiskParameters />
            </Suspense>
          </div>
          <Suspense
            fallback={
              <div className="h-48 animate-pulse rounded-lg bg-muted" />
            }
          >
            <TrailingStops />
          </Suspense>
        </div>
      )}
    </div>
  );
}
