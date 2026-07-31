"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  RefreshCw,
  ScrollText,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type SystemLog } from "@/lib/api";
import { cn } from "@/lib/utils";

const FETCH_LIMIT = 20;
const REFRESH_MS = 30_000;

function formatTimeAgo(timestamp: number): string {
  // Logs may arrive as seconds or milliseconds
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function normalizeLevel(level: string): string {
  return (level || "info").toLowerCase();
}

function levelStyle(level: string): {
  badge: string;
  icon: typeof Info;
  iconClass: string;
} {
  const n = normalizeLevel(level);
  if (n === "error") {
    return {
      badge: "border-destructive/30 bg-destructive/10 text-destructive",
      icon: AlertCircle,
      iconClass: "text-destructive",
    };
  }
  if (n === "warn" || n === "warning") {
    return {
      badge: "border-warning/30 bg-warning/10 text-warning",
      icon: AlertTriangle,
      iconClass: "text-warning",
    };
  }
  if (n === "success") {
    return {
      badge: "border-success/30 bg-success/10 text-success",
      icon: CheckCircle2,
      iconClass: "text-success",
    };
  }
  return {
    badge: "border-primary/30 bg-primary/10 text-primary",
    icon: Info,
    iconClass: "text-primary",
  };
}

function logSource(log: SystemLog & { module?: string }): string {
  return log.source || log.module || "system";
}

function ActivitySkeleton() {
  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </CardContent>
    </Card>
  );
}

export function RecentActivity() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.getLogs(FETCH_LIMIT);
      if (result.success) {
        setLogs(result.logs ?? []);
      } else {
        setLogs([]);
        setError("Activity feed unavailable");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [live, load]);

  if (loading) {
    return <ActivitySkeleton />;
  }

  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5 transition-all duration-300 hover:border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          <CardDescription className="text-xs">
            System logs across workers
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-pressed={live}
            aria-label={live ? "Pause live updates" : "Resume live updates"}
          >
            <Badge
              variant={live ? "default" : "secondary"}
              className={cn(
                "cursor-pointer gap-1 text-xs transition-colors",
                live && "bg-success/20 text-success hover:bg-success/30"
              )}
            >
              <Zap className={cn("h-3 w-3", live && "animate-pulse")} />
              {live ? "Live" : "Paused"}
            </Badge>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh activity"
          >
            <RefreshCw
              className={cn(
                "size-3.5 text-muted-foreground",
                refreshing && "animate-spin"
              )}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && logs.length === 0 ? (
          <div
            className="flex h-[280px] flex-col items-center justify-center gap-3 text-center"
            role="alert"
          >
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <Empty className="h-[280px] border-0 py-8 md:py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollText className="text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No recent activity</EmptyTitle>
              <EmptyDescription className="text-xs">
                Worker logs will stream here once the system is processing
                signals and trades.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/logs">Open logs</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <ScrollArea className="h-[280px] pr-3">
              <AnimatePresence mode="popLayout" initial={false}>
                <ul
                  className="flex flex-col gap-2"
                  aria-label="Recent system activity"
                >
                  {logs.map((log, index) => {
                    const style = levelStyle(log.level);
                    const Icon = style.icon;
                    const source = logSource(
                      log as SystemLog & { module?: string }
                    );
                    return (
                      <motion.li
                        key={`${log.id}-${log.timestamp}`}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.2, delay: index * 0.015 }}
                        className="group rounded-lg bg-secondary/30 p-3 transition-colors hover:bg-secondary/50"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60",
                              style.iconClass
                            )}
                          >
                            <Icon className="size-4" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-5 px-1.5 text-[10px] capitalize",
                                  style.badge
                                )}
                              >
                                {normalizeLevel(log.level)}
                              </Badge>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {source}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm leading-snug text-foreground">
                              {log.message}
                            </p>
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="size-3" aria-hidden />
                              <time
                                dateTime={new Date(
                                  log.timestamp < 1e12
                                    ? log.timestamp * 1000
                                    : log.timestamp
                                ).toISOString()}
                              >
                                {formatTimeAgo(log.timestamp)}
                              </time>
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </AnimatePresence>
            </ScrollArea>
            <div className="mt-3 border-t border-border pt-3">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
              >
                <Link href="/dashboard/logs">View all logs</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
