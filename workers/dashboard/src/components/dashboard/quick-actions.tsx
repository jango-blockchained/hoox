"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  ChartLine,
  Radio,
  Settings2,
  Shield,
  ShieldOff,
  Brain,
  ScrollText,
  ExternalLink,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AgentStatusResponse {
  success: boolean;
  status?: {
    killSwitch?: boolean;
    activeStops?: number;
    lastCheck?: string;
  };
  error?: string;
}

const JUMP_LINKS = [
  {
    href: "/dashboard/positions",
    label: "Positions",
    description: "Open book",
    icon: ChartLine,
  },
  {
    href: "/dashboard/signals",
    label: "Signals",
    description: "Ingest feed",
    icon: Radio,
  },
  {
    href: "/dashboard/agent",
    label: "AI Agent",
    description: "Risk & health",
    icon: Brain,
  },
  {
    href: "/dashboard/logs",
    label: "Logs",
    description: "System trail",
    icon: ScrollText,
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    description: "Trade metrics",
    icon: Activity,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    description: "Config & workers",
    icon: Settings2,
  },
] as const;

export function QuickActions() {
  const [killSwitch, setKillSwitch] = useState(false);
  const [activeStops, setActiveStops] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/agent/status", { signal });
      const data = (await res.json()) as AgentStatusResponse;
      if (data.success && data.status) {
        setKillSwitch(Boolean(data.status.killSwitch));
        setActiveStops(
          typeof data.status.activeStops === "number"
            ? data.status.activeStops
            : null
        );
        setLastCheck(data.status.lastCheck ?? new Date().toISOString());
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Soft-fail: actions still usable without status
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal);
    const id = setInterval(() => void fetchStatus(), 30_000);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [fetchStatus]);

  const handleKillSwitch = async () => {
    const action = killSwitch ? "release_kill_switch" : "engage_kill_switch";
    const confirmed =
      killSwitch ||
      (typeof window !== "undefined"
        ? window.confirm(
            "Engage the kill switch? New trade execution will be blocked until released."
          )
        : false);
    if (!confirmed && !killSwitch) return;

    setToggling(true);
    try {
      const res = await fetch("/api/agent/risk-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (data.success) {
        setKillSwitch(!killSwitch);
        toast.success(
          data.message ??
            (killSwitch ? "Kill switch released" : "Kill switch engaged")
        );
        void fetchStatus();
      } else {
        toast.error(data.error || "Kill switch action failed");
      }
    } catch {
      toast.error("Failed to update kill switch");
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5 transition-all duration-300 hover:border-primary/40">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            <CardDescription className="text-xs">
              Shortcuts & risk controls
            </CardDescription>
          </div>
          {loading ? (
            <Skeleton className="h-5 w-20 rounded-full" />
          ) : (
            <Badge
              variant="secondary"
              className={cn(
                "gap-1 text-xs",
                killSwitch
                  ? "bg-destructive/15 text-destructive"
                  : "bg-success/15 text-success"
              )}
            >
              {killSwitch ? (
                <ShieldOff className="size-3" aria-hidden />
              ) : (
                <Shield className="size-3" aria-hidden />
              )}
              {killSwitch ? "Trading blocked" : "Trading live"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Kill switch */}
        <div
          className={cn(
            "rounded-lg border p-3",
            killSwitch
              ? "border-destructive/40 bg-destructive/5"
              : "border-border bg-secondary/30"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-foreground">Kill switch</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {killSwitch
                  ? "Execution is halted. Release to resume trading."
                  : "Emergency halt for all new trade execution."}
              </p>
              {activeStops !== null && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Active trailing stops:{" "}
                  <span className="font-medium text-foreground">
                    {activeStops}
                  </span>
                </p>
              )}
              {lastCheck && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Status checked {new Date(lastCheck).toLocaleTimeString()}
                </p>
              )}
            </div>
            <Button
              variant={killSwitch ? "default" : "destructive"}
              size="sm"
              className="shrink-0"
              onClick={() => void handleKillSwitch()}
              disabled={toggling || loading}
              aria-label={
                killSwitch ? "Release kill switch" : "Engage kill switch"
              }
            >
              {toggling ? (
                <>
                  <Spinner className="size-3.5" data-icon="inline-start" />
                  Working…
                </>
              ) : killSwitch ? (
                <>
                  <Shield className="size-3.5" data-icon="inline-start" />
                  Release
                </>
              ) : (
                <>
                  <ShieldOff className="size-3.5" data-icon="inline-start" />
                  Engage
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Jump links */}
        <nav aria-label="Command center shortcuts">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {JUMP_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex flex-col gap-1 rounded-lg border border-border bg-secondary/20 p-3 transition-all hover:border-primary/40 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between">
                    <item.icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                    <ExternalLink className="size-3 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {item.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/dashboard/agent/risk">Open risk controls</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
