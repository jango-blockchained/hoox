"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Filter,
  Inbox,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  X,
  Database,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  SignalsPayloadDrawer,
  type SignalDetail,
} from "@/components/dashboard/signals-payload-drawer";

// ── Types ────────────────────────────────────────────────────────────

interface AggregateRow {
  source: string;
  signal_type: string;
  symbol: string;
  signal_count: number;
  avg_confidence: number;
}

/** Normalized row from D1 `trade_signals` (schema may drift slightly). */
interface RecentSignal {
  id: string;
  signalId: string;
  timestampMs: number;
  symbol: string;
  signalType: string;
  source: string;
  rawData: string | null;
  processedAtMs: number | null;
}

type TimeRange = "7d" | "30d" | "90d" | "all";
type SignalTypeFilter =
  | "all"
  | "BUY"
  | "SELL"
  | "NEUTRAL"
  | "HOLD"
  | "LONG"
  | "SHORT";
type SortField = "signal_count" | "symbol" | "avg_confidence" | "source";
type SortDir = "asc" | "desc";
type PageSize = 10 | 25 | 50;

const TIME_RANGE_DAYS: Record<Exclude<TimeRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const SIGNAL_TYPE_VALUES: readonly SignalTypeFilter[] = [
  "all",
  "BUY",
  "SELL",
  "LONG",
  "SHORT",
  "HOLD",
  "NEUTRAL",
] as const;

const PAGE_SIZE_OPTIONS: readonly PageSize[] = [10, 25, 50] as const;

// ── Helpers ──────────────────────────────────────────────────────────

function confidenceClass(c: number): string {
  if (c >= 0.7) return "text-success";
  if (c >= 0.4) return "text-warning";
  return "text-destructive";
}

function confidenceStatus(c: number): {
  label: string;
  className: string;
} {
  if (c >= 0.7) {
    return {
      label: "High",
      className: "bg-success/10 text-success border-success/20",
    };
  }
  if (c >= 0.4) {
    return {
      label: "Medium",
      className: "bg-warning/10 text-warning border-warning/20",
    };
  }
  return {
    label: "Low",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  };
}

function typeBadgeClass(t: string): string {
  const upper = t.toUpperCase();
  if (upper === "BUY" || upper === "LONG") {
    return "bg-success/10 text-success border-success/20";
  }
  if (upper === "SELL" || upper === "SHORT") {
    return "bg-destructive/10 text-destructive border-destructive/20";
  }
  return "bg-warning/10 text-warning border-warning/20";
}

function periodLabel(range: TimeRange): string {
  switch (range) {
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
    default:
      return "All time";
  }
}

function buildSignalsUrl(timeRange: TimeRange): string {
  const url = new URL("/api/analytics/signals", window.location.origin);
  if (timeRange !== "all") {
    const days = TIME_RANGE_DAYS[timeRange];
    url.searchParams.set(
      "timeRange",
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    );
  }
  return url.toString();
}

/** Normalize Unix seconds or ms into ms. */
function toMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return toMs(n);
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }
  // Seconds ≈ 2001–2286
  if (value >= 1_000_000_000 && value < 100_000_000_000) return value * 1000;
  return value;
}

function formatRelative(timestampMs: number, nowMs: number): string {
  const seconds = Math.floor((nowMs - timestampMs) / 1000);
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestampMs).toLocaleDateString();
}

function formatAbsolute(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return "—";
  return new Date(timestampMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeRecentRow(row: Record<string, unknown>): RecentSignal {
  const signalId = asString(
    row.signal_id ?? row.signalId ?? row.id,
    crypto.randomUUID()
  );
  const timestampMs =
    toMs(row.timestamp) ?? toMs(row.processed_at) ?? Date.now();
  const signalType = asString(
    row.signal_type ?? row.side ?? row.action ?? row.type,
    "UNKNOWN"
  ).toUpperCase();
  const raw =
    row.raw_data ?? row.rawData ?? row.metadata ?? row.payload ?? null;
  let rawData: string | null = null;
  if (typeof raw === "string") {
    rawData = raw;
  } else if (raw !== null && typeof raw === "object") {
    try {
      rawData = JSON.stringify(raw);
    } catch {
      rawData = String(raw);
    }
  }

  return {
    id: signalId,
    signalId,
    timestampMs,
    symbol: asString(row.symbol, "—"),
    signalType,
    source: asString(row.source ?? row.exchange, "unknown"),
    rawData,
    processedAtMs: toMs(row.processed_at ?? row.processedAt),
  };
}

function buildPageList(
  current: number,
  total: number
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [];
  const showLeftEllipsis = current > 3;
  const showRightEllipsis = current < total - 2;

  pages.push(1);
  if (showLeftEllipsis) pages.push("ellipsis");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (showRightEllipsis) pages.push("ellipsis");
  pages.push(total);

  return pages;
}

// ── Component ────────────────────────────────────────────────────────

export function SignalsTable() {
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Aggregates (Analytics Engine)
  const [aggregates, setAggregates] = useState<AggregateRow[]>([]);
  const [aggLoading, setAggLoading] = useState(true);
  const [aggError, setAggError] = useState<string | null>(null);

  // Recent rows (D1 trade_signals via api.queryTable)
  const [recent, setRecent] = useState<RecentSignal[]>([]);
  const [recentTotal, setRecentTotal] = useState<number | null>(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);

  // Shared filters
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [typeFilter, setTypeFilter] = useState<SignalTypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [symbolFilter, setSymbolFilter] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Aggregate sort + pagination
  const [sortField, setSortField] = useState<SortField>("signal_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  // Recent pagination
  const [recentPage, setRecentPage] = useState(1);

  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);
  const [symbolPopoverOpen, setSymbolPopoverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"recent" | "aggregates">("recent");

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDetail, setDrawerDetail] = useState<SignalDetail | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tick relative clocks every 30s while mounted
  useEffect(() => {
    if (!mounted) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [mounted]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
      setRecentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setRecentPage(1);
  }, [timeRange, typeFilter, sourceFilter, symbolFilter, pageSize]);

  const fetchAggregates = useCallback(
    async (signal?: AbortSignal) => {
      setAggLoading(true);
      setAggError(null);
      try {
        const res = await fetch(buildSignalsUrl(timeRange), { signal });
        if (!res.ok) {
          throw new Error(`Analytics returned ${res.status}`);
        }
        const json = (await res.json()) as {
          success: boolean;
          data?: AggregateRow[];
          error?: string;
        };
        if (!json.success) {
          throw new Error(json.error || "Analytics query failed");
        }
        setAggregates(json.data ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Failed to load aggregates";
        setAggError(message);
        setAggregates([]);
      } finally {
        setAggLoading(false);
      }
    },
    [timeRange]
  );

  const fetchRecent = useCallback(async () => {
    setRecentLoading(true);
    setRecentError(null);
    try {
      const result = await api.queryTable("trade_signals", 100);
      const rows = (result.rows ?? []).map(normalizeRecentRow);
      // Client-side time filter (D1 query is unscoped beyond LIMIT)
      let filtered = rows;
      if (timeRange !== "all") {
        const cutoff =
          Date.now() - TIME_RANGE_DAYS[timeRange] * 24 * 60 * 60 * 1000;
        filtered = rows.filter((r) => r.timestampMs >= cutoff);
      }
      // Newest first
      filtered.sort((a, b) => b.timestampMs - a.timestampMs);
      setRecent(filtered);
      setRecentTotal(result.count);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load recent signals from D1";
      setRecentError(message);
      setRecent([]);
      setRecentTotal(null);
      // Prefer the working Analytics path when D1 is unreachable.
      setActiveTab((tab) => (tab === "recent" ? "aggregates" : tab));
    } finally {
      setRecentLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    if (!mounted) return;
    const controller = new AbortController();
    void fetchAggregates(controller.signal);
    return () => controller.abort();
  }, [mounted, fetchAggregates]);

  useEffect(() => {
    if (!mounted) return;
    void fetchRecent();
  }, [mounted, fetchRecent]);

  const refresh = useCallback(() => {
    void fetchAggregates();
    void fetchRecent();
  }, [fetchAggregates, fetchRecent]);

  // ── Filter option lists ────────────────────────────────────────────

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const row of aggregates) set.add(row.source);
    for (const row of recent) set.add(row.source);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [aggregates, recent]);

  const availableSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const row of aggregates) set.add(row.symbol);
    for (const row of recent) set.add(row.symbol);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [aggregates, recent]);

  // ── Aggregates pipeline ────────────────────────────────────────────

  const filteredAggregates = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return aggregates.filter((row) => {
      if (
        typeFilter !== "all" &&
        row.signal_type.toUpperCase() !== typeFilter
      ) {
        return false;
      }
      if (sourceFilter.length > 0 && !sourceFilter.includes(row.source)) {
        return false;
      }
      if (symbolFilter.length > 0 && !symbolFilter.includes(row.symbol)) {
        return false;
      }
      if (needle) {
        const hay =
          `${row.symbol} ${row.source} ${row.signal_type}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [aggregates, typeFilter, sourceFilter, symbolFilter, debouncedSearch]);

  const sortedAggregates = useMemo(() => {
    const arr = [...filteredAggregates];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "signal_count":
          cmp = a.signal_count - b.signal_count;
          break;
        case "avg_confidence":
          cmp = a.avg_confidence - b.avg_confidence;
          break;
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "source":
          cmp = a.source.localeCompare(b.source);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredAggregates, sortField, sortDir]);

  const aggTotalPages = Math.max(
    1,
    Math.ceil(sortedAggregates.length / pageSize)
  );
  const aggSafePage = Math.min(page, aggTotalPages);
  const paginatedAggregates = useMemo(() => {
    const start = (aggSafePage - 1) * pageSize;
    return sortedAggregates.slice(start, start + pageSize);
  }, [sortedAggregates, aggSafePage, pageSize]);

  // ── Recent pipeline ────────────────────────────────────────────────

  const filteredRecent = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return recent.filter((row) => {
      if (typeFilter !== "all" && row.signalType !== typeFilter) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(row.source)) {
        return false;
      }
      if (symbolFilter.length > 0 && !symbolFilter.includes(row.symbol)) {
        return false;
      }
      if (needle) {
        const hay =
          `${row.symbol} ${row.source} ${row.signalType} ${row.signalId}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [recent, typeFilter, sourceFilter, symbolFilter, debouncedSearch]);

  const recentTotalPages = Math.max(
    1,
    Math.ceil(filteredRecent.length / pageSize)
  );
  const recentSafePage = Math.min(recentPage, recentTotalPages);
  const paginatedRecent = useMemo(() => {
    const start = (recentSafePage - 1) * pageSize;
    return filteredRecent.slice(start, start + pageSize);
  }, [filteredRecent, recentSafePage, pageSize]);

  // ── Summary metrics ────────────────────────────────────────────────

  const totalSignals = useMemo(
    () => filteredAggregates.reduce((sum, r) => sum + r.signal_count, 0),
    [filteredAggregates]
  );
  const avgConfidence = useMemo(() => {
    if (filteredAggregates.length === 0) return null;
    const weighted = filteredAggregates.reduce(
      (acc, r) => acc + r.avg_confidence * r.signal_count,
      0
    );
    return totalSignals > 0 ? weighted / totalSignals : null;
  }, [filteredAggregates, totalSignals]);

  // ── Handlers ───────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function renderSortIcon(field: SortField) {
    if (sortField !== field) {
      return (
        <ArrowUpDown
          className="ml-1 h-3.5 w-3.5 text-muted-foreground"
          aria-hidden
        />
      );
    }
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3.5 w-3.5" aria-hidden />
    ) : (
      <ArrowDown className="ml-1 h-3.5 w-3.5" aria-hidden />
    );
  }

  function toggleSourceFilter(value: string) {
    setSourceFilter((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  function toggleSymbolFilter(value: string) {
    setSymbolFilter((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  function clearFilters() {
    setTypeFilter("all");
    setSourceFilter([]);
    setSymbolFilter([]);
    setSearchInput("");
    setDebouncedSearch("");
  }

  const hasActiveFilters =
    typeFilter !== "all" ||
    sourceFilter.length > 0 ||
    symbolFilter.length > 0 ||
    debouncedSearch.trim().length > 0;

  function openRecentDetail(row: RecentSignal) {
    setDrawerDetail({
      title: row.symbol,
      subtitle: `Signal ${row.signalId}`,
      typeLabel: row.signalType,
      typeClassName: typeBadgeClass(row.signalType),
      statusLabel: row.processedAtMs ? "Stored" : "Received",
      statusClassName: row.processedAtMs
        ? "bg-success/10 text-success border-success/20"
        : "bg-primary/10 text-primary border-primary/20",
      fields: [
        { label: "Signal ID", value: row.signalId, mono: true },
        { label: "Symbol", value: row.symbol, mono: true },
        { label: "Type", value: row.signalType },
        { label: "Source", value: row.source },
        {
          label: "Received",
          value: formatAbsolute(row.timestampMs),
        },
        {
          label: "Processed",
          value: row.processedAtMs ? formatAbsolute(row.processedAtMs) : "—",
        },
      ],
      rawPayload: row.rawData,
    });
    setDrawerOpen(true);
  }

  function openAggregateDetail(row: AggregateRow) {
    const status = confidenceStatus(row.avg_confidence);
    setDrawerDetail({
      title: `${row.symbol} · ${row.signal_type}`,
      subtitle: `Aggregated outcomes · ${periodLabel(timeRange)}`,
      typeLabel: row.signal_type,
      typeClassName: typeBadgeClass(row.signal_type),
      statusLabel: `${status.label} confidence`,
      statusClassName: status.className,
      fields: [
        { label: "Source", value: row.source },
        { label: "Symbol", value: row.symbol, mono: true },
        { label: "Type", value: row.signal_type },
        {
          label: "Count",
          value: row.signal_count.toLocaleString(),
          mono: true,
        },
        {
          label: "Avg confidence",
          value: `${(row.avg_confidence * 100).toFixed(1)}%`,
          mono: true,
        },
        { label: "Period", value: periodLabel(timeRange) },
      ],
      rawPayload: null,
    });
    setDrawerOpen(true);
  }

  if (!mounted) return null;

  const loading = aggLoading || recentLoading;
  const aggRangeStart =
    (aggSafePage - 1) * pageSize + (paginatedAggregates.length > 0 ? 1 : 0);
  const aggRangeEnd = Math.min(aggSafePage * pageSize, sortedAggregates.length);
  const recentRangeStart =
    (recentSafePage - 1) * pageSize + (paginatedRecent.length > 0 ? 1 : 0);
  const recentRangeEnd = Math.min(
    recentSafePage * pageSize,
    filteredRecent.length
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Aggregate volume
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {aggLoading ? "—" : totalSignals.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {periodLabel(timeRange)}
              </p>
            </div>
            <BarChart3
              className="h-8 w-8 text-muted-foreground/40"
              aria-hidden
            />
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Weighted confidence
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-2xl font-semibold tabular-nums",
                  avgConfidence !== null && confidenceClass(avgConfidence)
                )}
              >
                {aggLoading || avgConfidence === null
                  ? "—"
                  : `${(avgConfidence * 100).toFixed(0)}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                Across filtered groups
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                D1 recent rows
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {recentLoading
                  ? "—"
                  : recentError
                    ? "—"
                    : filteredRecent.length.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {recentTotal !== null
                  ? `${recentTotal.toLocaleString()} total in table`
                  : recentError
                    ? "Unavailable"
                    : "Loaded from trade_signals"}
              </p>
            </div>
            <Database
              className="h-8 w-8 text-muted-foreground/40"
              aria-hidden
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Trade Signals</CardTitle>
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {activeTab === "recent"
                    ? filteredRecent.length
                    : sortedAggregates.length}
                </Badge>
              </div>
              <CardDescription>
                Recent rows from D1 and aggregated outcomes from Analytics
                Engine. Expand a row to inspect metadata
                {activeTab === "recent" ? " and raw payload" : ""}.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={timeRange}
                onValueChange={(value) => setTimeRange(value as TimeRange)}
              >
                <SelectTrigger className="w-[140px]" aria-label="Time range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={typeFilter}
                onValueChange={(value) =>
                  setTypeFilter(value as SignalTypeFilter)
                }
              >
                <SelectTrigger className="w-[130px]" aria-label="Signal type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {SIGNAL_TYPE_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "all" ? "All Types" : value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <MultiFilterPopover
                label="Sources"
                open={sourcePopoverOpen}
                onOpenChange={setSourcePopoverOpen}
                options={availableSources}
                selected={sourceFilter}
                onToggle={toggleSourceFilter}
                disabled={availableSources.length === 0}
                searchPlaceholder="Search sources..."
                emptyLabel="No sources found."
              />

              <MultiFilterPopover
                label="Symbols"
                open={symbolPopoverOpen}
                onOpenChange={setSymbolPopoverOpen}
                options={availableSymbols}
                selected={symbolFilter}
                onToggle={toggleSymbolFilter}
                disabled={availableSymbols.length === 0}
                searchPlaceholder="Search symbols..."
                emptyLabel="No symbols found."
                mono
              />

              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v) as PageSize)}
              >
                <SelectTrigger className="w-[100px]" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="gap-1"
                  aria-label="Clear all filters"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              ) : null}

              <Button
                variant="ghost"
                size="icon"
                onClick={refresh}
                aria-label="Refresh signals"
                disabled={loading}
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Search symbol, source, type, or signal id…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              aria-label="Search signals"
            />
          </div>
        </CardHeader>

        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "recent" | "aggregates")}
          >
            <TabsList className="mb-4">
              <TabsTrigger value="recent" className="gap-1.5">
                <Database className="h-3.5 w-3.5" aria-hidden />
                Recent (D1)
              </TabsTrigger>
              <TabsTrigger value="aggregates" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                Aggregates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="mt-0">
              {recentError ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Could not load D1 signals</AlertTitle>
                  <AlertDescription>
                    {recentError}. The browser cannot call d1-worker /query
                    without the internal read key. Use the Aggregates tab
                    (Analytics Engine) or the Database explorer when a
                    server-side proxy is available.
                  </AlertDescription>
                </Alert>
              ) : null}

              {recentLoading ? (
                <LoadingSkeleton testId="signals-recent-skeleton" />
              ) : !recentError && filteredRecent.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox className="h-6 w-6" />
                    </EmptyMedia>
                    <EmptyTitle>No recent signals</EmptyTitle>
                    <EmptyDescription>
                      {hasActiveFilters
                        ? "Try adjusting filters or expanding the time range."
                        : "No rows returned from trade_signals for this period."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {hasActiveFilters ? (
                    <EmptyContent>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                      >
                        Clear filters
                      </Button>
                    </EmptyContent>
                  ) : null}
                </Empty>
              ) : !recentError ? (
                <div className="flex flex-col gap-4">
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Received</TableHead>
                          <TableHead scope="col">Symbol</TableHead>
                          <TableHead scope="col">Type</TableHead>
                          <TableHead scope="col">Source</TableHead>
                          <TableHead scope="col">Status</TableHead>
                          <TableHead scope="col" className="w-10">
                            <span className="sr-only">Open detail</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedRecent.map((row) => (
                          <TableRow
                            key={row.id}
                            className="cursor-pointer"
                            onClick={() => openRecentDetail(row)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openRecentDetail(row);
                              }
                            }}
                            tabIndex={0}
                            aria-label={`Open signal ${row.symbol} ${row.signalType}`}
                          >
                            <TableCell>
                              <time
                                dateTime={new Date(
                                  row.timestampMs
                                ).toISOString()}
                                title={formatAbsolute(row.timestampMs)}
                                className="text-sm text-muted-foreground"
                              >
                                {formatRelative(row.timestampMs, nowMs)}
                              </time>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {row.symbol}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "border",
                                  typeBadgeClass(row.signalType)
                                )}
                              >
                                {row.signalType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="capitalize">{row.source}</span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "border",
                                  row.processedAtMs
                                    ? "bg-success/10 text-success border-success/20"
                                    : "bg-primary/10 text-primary border-primary/20"
                                )}
                              >
                                {row.processedAtMs ? "Stored" : "Received"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <ChevronRight
                                className="h-4 w-4 text-muted-foreground"
                                aria-hidden
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <PaginationBar
                    page={recentSafePage}
                    totalPages={recentTotalPages}
                    rangeStart={recentRangeStart}
                    rangeEnd={recentRangeEnd}
                    total={filteredRecent.length}
                    onPageChange={setRecentPage}
                  />
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="aggregates" className="mt-0">
              {aggError ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Could not load signal aggregates</AlertTitle>
                  <AlertDescription>{aggError}</AlertDescription>
                </Alert>
              ) : null}

              {aggLoading ? (
                <LoadingSkeleton testId="signals-skeleton" />
              ) : !aggError && sortedAggregates.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox className="h-6 w-6" />
                    </EmptyMedia>
                    <EmptyTitle>No signals found</EmptyTitle>
                    <EmptyDescription>
                      Try adjusting your filters or expanding the time range.
                      Aggregates require Analytics Engine credentials and signal
                      events with blob1 = &apos;signal&apos;.
                    </EmptyDescription>
                  </EmptyHeader>
                  {hasActiveFilters ? (
                    <EmptyContent>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                      >
                        Clear filters
                      </Button>
                    </EmptyContent>
                  ) : null}
                </Empty>
              ) : !aggError ? (
                <div className="flex flex-col gap-4">
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead
                            scope="col"
                            aria-sort={
                              sortField === "source"
                                ? sortDir === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-ml-3 h-8 font-medium"
                              onClick={() => handleSort("source")}
                            >
                              Source {renderSortIcon("source")}
                            </Button>
                          </TableHead>
                          <TableHead scope="col">Type</TableHead>
                          <TableHead
                            scope="col"
                            aria-sort={
                              sortField === "symbol"
                                ? sortDir === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-ml-3 h-8 font-medium"
                              onClick={() => handleSort("symbol")}
                            >
                              Symbol {renderSortIcon("symbol")}
                            </Button>
                          </TableHead>
                          <TableHead
                            scope="col"
                            aria-sort={
                              sortField === "signal_count"
                                ? sortDir === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-ml-3 h-8 font-medium"
                              onClick={() => handleSort("signal_count")}
                            >
                              Count {renderSortIcon("signal_count")}
                            </Button>
                          </TableHead>
                          <TableHead
                            scope="col"
                            aria-sort={
                              sortField === "avg_confidence"
                                ? sortDir === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-ml-3 h-8 font-medium"
                              onClick={() => handleSort("avg_confidence")}
                            >
                              Confidence {renderSortIcon("avg_confidence")}
                            </Button>
                          </TableHead>
                          <TableHead scope="col">Quality</TableHead>
                          <TableHead scope="col">Period</TableHead>
                          <TableHead scope="col" className="w-10">
                            <span className="sr-only">Open detail</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedAggregates.map((row, index) => {
                          const status = confidenceStatus(row.avg_confidence);
                          return (
                            <TableRow
                              key={`${row.source}-${row.signal_type}-${row.symbol}-${index}`}
                              className="cursor-pointer"
                              onClick={() => openAggregateDetail(row)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openAggregateDetail(row);
                                }
                              }}
                              tabIndex={0}
                              aria-label={`Open aggregate ${row.symbol} ${row.signal_type}`}
                            >
                              <TableCell className="font-medium">
                                <span className="capitalize">{row.source}</span>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "border",
                                    typeBadgeClass(row.signal_type)
                                  )}
                                >
                                  {row.signal_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {row.symbol}
                              </TableCell>
                              <TableCell className="font-mono text-sm tabular-nums">
                                {row.signal_count.toLocaleString()}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "font-mono text-sm font-medium tabular-nums",
                                  confidenceClass(row.avg_confidence)
                                )}
                              >
                                {(row.avg_confidence * 100).toFixed(0)}%
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn("border", status.className)}
                                >
                                  {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {periodLabel(timeRange)}
                              </TableCell>
                              <TableCell>
                                <ChevronRight
                                  className="h-4 w-4 text-muted-foreground"
                                  aria-hidden
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <PaginationBar
                    page={aggSafePage}
                    totalPages={aggTotalPages}
                    rangeStart={aggRangeStart}
                    rangeEnd={aggRangeEnd}
                    total={sortedAggregates.length}
                    onPageChange={setPage}
                  />
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <SignalsPayloadDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        detail={drawerDetail}
      />
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function LoadingSkeleton({ testId }: { testId: string }) {
  return (
    <div
      className="flex flex-col gap-2"
      data-testid={testId}
      aria-busy="true"
      aria-label="Loading signals"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function MultiFilterPopover({
  label,
  open,
  onOpenChange,
  options,
  selected,
  onToggle,
  disabled,
  searchPlaceholder,
  emptyLabel,
  mono,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
  searchPlaceholder: string;
  emptyLabel: string;
  mono?: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={disabled}
          aria-label={`Filter by ${label.toLowerCase()}`}
        >
          <Filter className="h-4 w-4" aria-hidden />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 tabular-nums">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="end">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => onToggle(option)}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      )}
                      aria-hidden
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span
                      className={cn(mono ? "font-mono text-xs" : "capitalize")}
                    >
                      {option}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PaginationBar({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="text-xs text-muted-foreground">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onPageChange(Math.max(1, page - 1));
              }}
              aria-disabled={page === 1}
              className={cn(
                page === 1 &&
                  "pointer-events-none cursor-not-allowed opacity-50"
              )}
            />
          </PaginationItem>
          {buildPageList(page, totalPages).map((item, idx) =>
            item === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  href="#"
                  isActive={item === page}
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(item);
                  }}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onPageChange(Math.min(totalPages, page + 1));
              }}
              aria-disabled={page === totalPages}
              className={cn(
                page === totalPages &&
                  "pointer-events-none cursor-not-allowed opacity-50"
              )}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
