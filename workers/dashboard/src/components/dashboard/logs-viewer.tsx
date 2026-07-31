"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  Pause,
  Play,
  RefreshCw,
  Rows3,
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";

const REFRESH_INTERVAL_MS = 30_000;
const LOG_FETCH_LIMIT = 100;

type LogLevel = "all" | "info" | "warn" | "error" | "success";
type Density = "comfortable" | "compact";

const LEVEL_OPTIONS: ReadonlyArray<{ value: LogLevel; label: string }> = [
  { value: "all", label: "All Levels" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
  { value: "success", label: "Success" },
];

interface LevelStyle {
  badge: string;
  /** Left rail accent — paired with text badge so color is never the only cue */
  rail: string;
  row: string;
  icon: typeof Info;
  label: string;
}

function getLevelStyle(level: string): LevelStyle {
  const normalized = level.toLowerCase();
  if (normalized === "error") {
    return {
      badge: "bg-destructive/10 text-destructive border-destructive/30",
      rail: "bg-destructive",
      row: "hover:bg-destructive/5",
      icon: AlertCircle,
      label: "Error",
    };
  }
  if (normalized === "warn" || normalized === "warning") {
    return {
      badge: "bg-warning/10 text-warning border-warning/30",
      rail: "bg-warning",
      row: "hover:bg-warning/5",
      icon: AlertTriangle,
      label: "Warning",
    };
  }
  if (normalized === "success") {
    return {
      badge: "bg-success/10 text-success border-success/30",
      rail: "bg-success",
      row: "hover:bg-success/5",
      icon: CheckCircle2,
      label: "Success",
    };
  }
  return {
    badge: "bg-primary/10 text-primary border-primary/30",
    rail: "bg-primary",
    row: "hover:bg-primary/5",
    icon: Info,
    label: "Info",
  };
}

function formatAbsolute(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "yyyy-MM-dd HH:mm:ss");
}

function formatAbsoluteShort(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "MMM d, HH:mm:ss");
}

function formatRelative(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  } catch {
    return formatAbsoluteShort(timestamp);
  }
}

function normalizeLevel(level: string): Exclude<LogLevel, "all"> {
  const normalized = level.toLowerCase();
  if (normalized === "warn" || normalized === "warning") return "warn";
  if (normalized === "error") return "error";
  if (normalized === "success") return "success";
  return "info";
}

function logLineText(log: SystemLog): string {
  const ts = formatAbsolute(log.timestamp);
  const source = log.source?.trim() || "unknown";
  return `[${ts}] ${log.level.toUpperCase()} ${source} — ${log.message}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function LogsViewer() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<LogLevel>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [density, setDensity] = useState<Density>("comfortable");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadLogs = useCallback(
    async (
      mode: "initial" | "silent" | "manual" = "silent"
    ): Promise<boolean> => {
      if (mode === "initial") setLoading(true);
      if (mode === "manual") setRefreshing(true);

      try {
        const result = await api.getLogs(LOG_FETCH_LIMIT);
        if (result.success) {
          setLogs(result.logs ?? []);
          setFetchError(null);
          setLastUpdatedAt(Date.now());
          return true;
        }
        setLogs([]);
        setFetchError("The log service returned an unsuccessful response.");
        if (mode !== "silent") {
          toast.error("Failed to fetch logs", {
            description: "The log service returned an unsuccessful response.",
          });
        }
        return false;
      } catch (error) {
        const description =
          error instanceof Error ? error.message : "Unknown error";
        setFetchError(description);
        if (mode !== "silent") {
          toast.error("Failed to fetch logs", { description });
        }
        // Keep previous logs on background failure so the stream doesn't blank out.
        if (mode === "initial") setLogs([]);
        return false;
      } finally {
        if (mode === "initial") setLoading(false);
        if (mode === "manual") setRefreshing(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    if (!mounted) return;
    void loadLogs("initial");
  }, [mounted, loadLogs]);

  // Auto-refresh (silent — never flashes skeleton)
  useEffect(() => {
    if (!mounted || !autoRefresh) return;
    const interval = setInterval(() => {
      void loadLogs("silent");
    }, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [mounted, autoRefresh, loadLogs]);

  const handleRefresh = async () => {
    const ok = await loadLogs("manual");
    if (ok) toast.success("Logs refreshed");
  };

  const handleCopyLine = async (log: SystemLog) => {
    const ok = await copyText(logLineText(log));
    if (ok) {
      setCopiedId(log.id);
      toast.success("Log line copied");
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === log.id ? null : prev));
      }, 1500);
    } else {
      toast.error("Could not copy to clipboard");
    }
  };

  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    for (const log of logs) {
      if (log.source) sources.add(log.source);
    }
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }, [logs]);

  const levelCounts = useMemo(() => {
    const counts: Record<Exclude<LogLevel, "all">, number> = {
      info: 0,
      warn: 0,
      error: 0,
      success: 0,
    };
    for (const log of logs) {
      counts[normalizeLevel(log.level)] += 1;
    }
    return counts;
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
        (log.source?.toLowerCase().includes(query) ?? false) ||
        log.level.toLowerCase().includes(query);
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

  const isCompact = density === "compact";

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-2">
                <ScrollText
                  className="h-5 w-5 text-primary"
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-1">
                  <CardTitle>System Event Stream</CardTitle>
                  <CardDescription>
                    Live log entries from all workers
                    {lastUpdatedAt
                      ? ` · updated ${formatRelative(lastUpdatedAt)}`
                      : ""}
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                  <Switch
                    id="logs-auto-refresh"
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                    size="sm"
                    aria-label="Toggle auto-refresh"
                  />
                  <Label
                    htmlFor="logs-auto-refresh"
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-medium"
                  >
                    {autoRefresh ? (
                      <Play
                        className="h-3 w-3 text-success"
                        aria-hidden="true"
                      />
                    ) : (
                      <Pause
                        className="h-3 w-3 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    Auto-refresh
                  </Label>
                </div>
                <ToggleGroup
                  type="single"
                  value={density}
                  onValueChange={(value) => {
                    if (value === "comfortable" || value === "compact") {
                      setDensity(value);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  aria-label="Row density"
                >
                  <ToggleGroupItem
                    value="comfortable"
                    aria-label="Comfortable density"
                  >
                    Comfortable
                  </ToggleGroupItem>
                  <ToggleGroupItem value="compact" aria-label="Compact density">
                    <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
                    Compact
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2"
                  onClick={() => void handleRefresh()}
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
            </div>

            {/* Level summary chips — filter + counts */}
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Filter by log level"
            >
              {LEVEL_OPTIONS.map((opt) => {
                const count =
                  opt.value === "all"
                    ? logs.length
                    : levelCounts[opt.value as Exclude<LogLevel, "all">];
                const active = levelFilter === opt.value;
                const styles =
                  opt.value === "all" ? null : getLevelStyle(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLevelFilter(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? styles
                          ? cn(styles.badge, "border-current/40")
                          : "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-secondary/60"
                    )}
                    aria-pressed={active}
                  >
                    {styles && (
                      <styles.icon className="h-3 w-3" aria-hidden="true" />
                    )}
                    <span>{opt.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 font-mono text-[10px]",
                        active ? "bg-background/50" : "bg-secondary"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  data-icon="inline-start"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Search messages, source, or level…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9"
                  aria-label="Search logs"
                />
              </div>
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
            ) : fetchError && logs.length === 0 ? (
              <LogsError
                error={fetchError}
                onRetry={() => void handleRefresh()}
              />
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
                    Showing{" "}
                    <span className="font-medium text-foreground">
                      {filteredLogs.length}
                    </span>{" "}
                    of {logs.length} entries
                    {fetchError ? (
                      <span className="ml-2 text-warning">
                        · last refresh failed
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {autoRefresh ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                        </span>
                        Live · {REFRESH_INTERVAL_MS / 1000}s auto-refresh
                      </>
                    ) : (
                      <>
                        <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground" />
                        Paused
                      </>
                    )}
                  </span>
                </div>

                <div className="overflow-hidden rounded-md border border-border">
                  {/* Column headers */}
                  <div
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground sm:grid-cols-[140px_100px_130px_minmax(0,1fr)_36px]",
                      isCompact ? "px-2 py-1.5" : "px-3 py-2"
                    )}
                    role="row"
                  >
                    <span className="hidden sm:inline">Time</span>
                    <span className="hidden sm:inline">Level</span>
                    <span className="hidden sm:inline">Source</span>
                    <span className="hidden sm:inline">Message</span>
                    <span className="sr-only sm:not-sr-only sm:text-center">
                      Copy
                    </span>
                    <span className="sm:hidden">Log entries</span>
                  </div>

                  <ScrollArea className="h-[min(60vh,560px)]">
                    <ul
                      className="divide-y divide-border"
                      aria-label="System log entries"
                      aria-live="polite"
                    >
                      {filteredLogs.map((log) => {
                        const styles = getLevelStyle(log.level);
                        const Icon = styles.icon;
                        const absolute = formatAbsolute(log.timestamp);
                        const relative = formatRelative(log.timestamp);
                        const shortAbs = formatAbsoluteShort(log.timestamp);

                        return (
                          <li
                            key={log.id}
                            className={cn(
                              "group relative grid grid-cols-1 gap-1.5 transition-colors sm:grid-cols-[140px_100px_130px_minmax(0,1fr)_36px] sm:items-center sm:gap-2",
                              styles.row,
                              isCompact ? "px-2 py-1.5" : "px-3 py-2.5"
                            )}
                          >
                            {/* Level rail for quick scan (a11y: text badge still present) */}
                            <span
                              className={cn(
                                "absolute inset-y-0 left-0 w-0.5",
                                styles.rail
                              )}
                              aria-hidden="true"
                            />

                            <div className="pl-2 sm:pl-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <time
                                    dateTime={
                                      log.timestamp
                                        ? new Date(log.timestamp).toISOString()
                                        : undefined
                                    }
                                    className="block cursor-default font-mono text-[11px] text-muted-foreground"
                                  >
                                    <span className="block text-foreground/80">
                                      {relative}
                                    </span>
                                    <span className="block text-[10px] opacity-80">
                                      {shortAbs}
                                    </span>
                                  </time>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {absolute}
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            <div className="pl-2 sm:pl-0">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "gap-1 border font-medium",
                                  styles.badge,
                                  isCompact && "h-5 px-1.5 text-[10px]"
                                )}
                              >
                                <Icon className="h-3 w-3" aria-hidden="true" />
                                <span className="sr-only">
                                  Level: {styles.label}.{" "}
                                </span>
                                {log.level}
                              </Badge>
                            </div>

                            <div className="pl-2 sm:pl-0">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {log.source || "—"}
                              </span>
                            </div>

                            <div className="min-w-0 pl-2 sm:pl-0">
                              <p
                                className={cn(
                                  "break-words text-sm text-foreground",
                                  isCompact && "text-xs leading-snug"
                                )}
                              >
                                {log.message}
                              </p>
                            </div>

                            <div className="flex justify-end pl-2 sm:pl-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className={cn(
                                      "h-7 w-7 opacity-70 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                                      copiedId === log.id && "text-success"
                                    )}
                                    onClick={() => void handleCopyLine(log)}
                                    aria-label={`Copy log line: ${log.message.slice(0, 80)}`}
                                  >
                                    {copiedId === log.id ? (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  Copy line
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </ScrollArea>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </TooltipProvider>
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
          <Skeleton className="h-8 w-[120px]" />
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

interface LogsErrorProps {
  error: string;
  onRetry: () => void;
}

function LogsError({ error, onRetry }: LogsErrorProps) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </EmptyMedia>
        <EmptyTitle>Could not load logs</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  );
}
