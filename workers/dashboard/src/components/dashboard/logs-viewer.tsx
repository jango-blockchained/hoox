"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { api, type SystemLog } from "@/lib/api";
import { cn } from "@/lib/utils";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const REFRESH_INTERVAL_MS = 30_000;
const LOG_FETCH_LIMIT = 100;

type LogLevel = "all" | "info" | "warn" | "error" | "success";

const LEVEL_OPTIONS: ReadonlyArray<{ value: LogLevel; label: string }> = [
  { value: "all", label: "All Levels" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
  { value: "success", label: "Success" },
];

interface LevelStyle {
  badge: string;
  icon: typeof Info;
}

function getLevelStyle(level: string): LevelStyle {
  const normalized = level.toLowerCase();
  if (normalized === "error") {
    return {
      badge: "bg-destructive/10 text-destructive border-destructive/30",
      icon: AlertCircle,
    };
  }
  if (normalized === "warn" || normalized === "warning") {
    return {
      badge: "bg-warning/10 text-warning border-warning/30",
      icon: AlertTriangle,
    };
  }
  if (normalized === "success") {
    return {
      badge: "bg-success/10 text-success border-success/30",
      icon: CheckCircle2,
    };
  }
  return {
    badge: "bg-primary/10 text-primary border-primary/30",
    icon: Info,
  };
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "MMM d, HH:mm:ss");
}

function normalizeLevel(level: string): LogLevel {
  const normalized = level.toLowerCase();
  if (
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error" ||
    normalized === "success"
  ) {
    return normalized;
  }
  return "info";
}

export function LogsViewer() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LogLevel>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadLogs = async (): Promise<void> => {
    try {
      const result = await api.getLogs(LOG_FETCH_LIMIT);
      if (result.success) {
        setLogs(result.logs ?? []);
      } else {
        setLogs([]);
      }
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to fetch logs", { description });
      setLogs([]);
    }
  };

  // Initial load + auto-revalidation every 30s
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      try {
        setLoading(true);
        const result = await api.getLogs(LOG_FETCH_LIMIT);
        if (cancelled) return;
        if (result.success) {
          setLogs(result.logs ?? []);
        } else {
          setLogs([]);
        }
      } catch (error) {
        if (cancelled) return;
        const description =
          error instanceof Error ? error.message : "Unknown error";
        toast.error("Failed to fetch logs", { description });
        setLogs([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    const interval = setInterval(() => {
      void run();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mounted]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadLogs();
      toast.success("Logs refreshed");
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to refresh logs", { description });
    } finally {
      setRefreshing(false);
    }
  };

  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    for (const log of logs) {
      if (log.source) sources.add(log.source);
    }
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesLevel =
        levelFilter === "all" || normalizeLevel(log.level) === levelFilter;
      const matchesSource =
        sourceFilter === "all" || log.source === sourceFilter;
      const matchesSearch =
        !query ||
        log.message.toLowerCase().includes(query) ||
        (log.source?.toLowerCase().includes(query) ?? false);
      return matchesLevel && matchesSource && matchesSearch;
    });
  }, [logs, levelFilter, sourceFilter, searchQuery]);

  const hasActiveFilters =
    levelFilter !== "all" || sourceFilter !== "all" || searchQuery.length > 0;

  const clearFilters = () => {
    setLevelFilter("all");
    setSourceFilter("all");
    setSearchQuery("");
  };

  if (!mounted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              <div className="flex flex-col gap-1">
                <CardTitle>System Event Stream</CardTitle>
                <CardDescription>
                  Live log entries from all workers · auto-refreshes every 30s
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={handleRefresh}
              disabled={refreshing || loading}
            >
              <RefreshCw
                data-icon="inline-start"
                className={cn(
                  "h-4 w-4",
                  (refreshing || loading) && "animate-spin"
                )}
              />
              Refresh
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search
                data-icon="inline-start"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search messages or source..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9"
                aria-label="Search logs"
              />
            </div>
            <Select
              value={levelFilter}
              onValueChange={(value) => setLevelFilter(value as LogLevel)}
            >
              <SelectTrigger
                className="h-9 w-[150px]"
                aria-label="Filter by level"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sourceFilter}
              onValueChange={setSourceFilter}
              disabled={availableSources.length === 0}
            >
              <SelectTrigger
                className="h-9 w-[170px]"
                aria-label="Filter by source worker"
              >
                <SelectValue placeholder="All Workers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workers</SelectItem>
                {availableSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-2"
                onClick={clearFilters}
              >
                <X data-icon="inline-start" className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <LogsSkeleton />
          ) : filteredLogs.length === 0 ? (
            <LogsEmpty
              hasAnyLogs={logs.length > 0}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Showing {filteredLogs.length} of {logs.length} entries
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  Live · 30s auto-refresh
                </span>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[170px]">Timestamp</TableHead>
                      <TableHead className="w-[120px]">Level</TableHead>
                      <TableHead className="w-[160px]">Source</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => {
                      const styles = getLevelStyle(log.level);
                      const Icon = styles.icon;
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {formatTimestamp(log.timestamp)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1.5 border font-medium",
                                styles.badge
                              )}
                            >
                              <Icon className="h-3 w-3" />
                              {log.level}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">
                              {log.source || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.message}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function LogsSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Loading logs"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-4 w-[150px]" />
          <Skeleton className="h-6 w-[90px] rounded-full" />
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-4 min-w-[120px] flex-1" />
        </div>
      ))}
    </div>
  );
}

interface LogsEmptyProps {
  hasAnyLogs: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

function LogsEmpty({
  hasAnyLogs,
  hasActiveFilters,
  onClearFilters,
}: LogsEmptyProps) {
  const title = hasAnyLogs ? "No logs match your filters" : "No logs available";
  const description = hasAnyLogs
    ? "Adjust the level, worker, or search query to see more entries."
    : "The system log stream is currently empty. New events will appear here automatically.";

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ScrollText className="h-5 w-5 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {hasActiveFilters && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
