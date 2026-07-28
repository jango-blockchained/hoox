"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from "react";
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
import {
  Search,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Filter,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SignalRow {
  source: string;
  signal_type: string;
  symbol: string;
  signal_count: number;
  avg_confidence: number;
}

type TimeRange = "7d" | "30d" | "90d" | "all";
type SignalTypeFilter = "all" | "BUY" | "SELL" | "NEUTRAL";
type SortField = "signal_count" | "symbol" | "avg_confidence" | "timestamp";
type SortDir = "asc" | "desc";

const TIME_RANGE_DAYS: Record<Exclude<TimeRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const SIGNAL_TYPE_VALUES: readonly SignalTypeFilter[] = [
  "all",
  "BUY",
  "SELL",
  "NEUTRAL",
] as const;

// Confidence → semantic token. Mid-range uses warning, low uses destructive.
function confidenceClass(c: number): string {
  if (c >= 0.7) return "text-success";
  if (c >= 0.4) return "text-warning";
  return "text-destructive";
}

// Signal type → semantic badge palette (outline + tinted bg + tinted text/border).
function typeBadgeClass(t: string): string {
  switch (t) {
    case "BUY":
      return "bg-success/10 text-success border-success/20";
    case "SELL":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-warning/10 text-warning border-warning/20";
  }
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

// Build the analytics endpoint URL with the active timeRange as ISO lower bound.
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

export function SignalsTable() {
  const [data, setData] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Filters
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [typeFilter, setTypeFilter] = useState<SignalTypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("signal_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);

  // Defer rendering until hydration completes (mirrors signal-outcomes.tsx pattern).
  useEffect(() => {
    setMounted(true);
  }, []);

  // 300ms debounce on free-text search; resets to first page.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Reset to first page whenever primary filters change.
  useEffect(() => {
    setPage(1);
  }, [timeRange, typeFilter, sourceFilter]);

  // Fetch signal outcomes whenever the time range or hydration completes.
  useEffect(() => {
    if (!mounted) return;
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(buildSignalsUrl(timeRange), {
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          success: boolean;
          data?: SignalRow[];
        };
        if (json.success) {
          setData(json.data ?? []);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch signals:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    return () => controller.abort();
  }, [timeRange, mounted]);

  const availableSources = useMemo(
    () => Array.from(new Set(data.map((row) => row.source))).sort(),
    [data]
  );

  // Apply client-side filters: type, source, and free-text search.
  const filteredData = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return data.filter((row) => {
      if (typeFilter !== "all" && row.signal_type !== typeFilter) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(row.source)) {
        return false;
      }
      if (needle) {
        const symbolMatch = row.symbol.toLowerCase().includes(needle);
        const sourceMatch = row.source.toLowerCase().includes(needle);
        if (!symbolMatch && !sourceMatch) return false;
      }
      return true;
    });
  }, [data, typeFilter, sourceFilter, debouncedSearch]);

  // Sort the filtered rows. The analytics endpoint groups signals and
  // returns no per-row timestamp, so "timestamp" sort preserves the
  // server-provided order (the SQL `ORDER BY signal_count DESC`).
  const sortedData = useMemo(() => {
    const arr = [...filteredData];
    if (sortField === "timestamp") {
      // Server already returns a meaningful order; do not mutate it.
      return arr;
    }
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
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredData, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, safePage, pageSize]);

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
      return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 ml-1" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 ml-1" />
    );
  }

  function toggleSourceFilter(value: string) {
    setSourceFilter((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  function refresh() {
    setLoading(true);
    void fetch(buildSignalsUrl(timeRange))
      .then(
        (res) => res.json() as Promise<{ success: boolean; data?: SignalRow[] }>
      )
      .then((json) => {
        if (json.success) setData(json.data ?? []);
      })
      .catch((error) => {
        console.error("Failed to refresh signals:", error);
      })
      .finally(() => setLoading(false));
  }

  if (!mounted) return null;

  const rangeStart = (page - 1) * pageSize + (paginatedData.length > 0 ? 1 : 0);
  const rangeEnd = Math.min(page * pageSize, sortedData.length);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <CardTitle>Signal Outcomes</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {sortedData.length}
              </Badge>
            </div>
            <CardDescription>
              Aggregated signal distribution • Period: {periodLabel(timeRange)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={timeRange}
              onValueChange={(value) => setTimeRange(value as TimeRange)}
            >
              <SelectTrigger className="w-[140px]">
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
              <SelectTrigger className="w-[130px]">
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

            <Popover
              open={sourcePopoverOpen}
              onOpenChange={setSourcePopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={availableSources.length === 0}
                >
                  <Filter className="h-4 w-4" />
                  Sources
                  {sourceFilter.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {sourceFilter.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search sources..." />
                  <CommandList>
                    <CommandEmpty>No sources found.</CommandEmpty>
                    <CommandGroup>
                      {availableSources.map((source) => {
                        const selected = sourceFilter.includes(source);
                        return (
                          <CommandItem
                            key={source}
                            value={source}
                            onSelect={() => toggleSourceFilter(source)}
                          >
                            <span
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-input"
                              )}
                            >
                              {selected && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <span className="capitalize">{source}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              aria-label="Refresh signals"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search symbol or source..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            aria-label="Search signals"
          />
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div
            className="flex flex-col gap-2"
            data-testid="signals-skeleton"
            aria-busy="true"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sortedData.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox className="h-6 w-6" />
              </EmptyMedia>
              <EmptyTitle>No signals found</EmptyTitle>
              <EmptyDescription>
                Try adjusting your filters or expanding the time range.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 font-medium"
                        onClick={() => handleSort("signal_count")}
                      >
                        Count {renderSortIcon("signal_count")}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 font-medium"
                        onClick={() => handleSort("avg_confidence")}
                      >
                        Avg Confidence {renderSortIcon("avg_confidence")}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 font-medium"
                        onClick={() => handleSort("timestamp")}
                      >
                        Period {renderSortIcon("timestamp")}
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((row, index) => (
                    <TableRow
                      key={`${row.source}-${row.signal_type}-${row.symbol}-${index}`}
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
                      <TableCell className="font-mono text-sm">
                        {row.signal_count.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono text-sm font-medium",
                          confidenceClass(row.avg_confidence)
                        )}
                      >
                        {(row.avg_confidence * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {periodLabel(timeRange)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {rangeStart}–{rangeEnd} of {sortedData.length}
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={(e) => {
                          e.preventDefault();
                          setPage((p) => Math.max(1, p - 1));
                        }}
                        aria-disabled={safePage === 1}
                        className={cn(
                          safePage === 1 &&
                            "pointer-events-none opacity-50 cursor-not-allowed"
                        )}
                      />
                    </PaginationItem>
                    {buildPageList(safePage, totalPages).map((item, idx) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${idx}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            isActive={item === safePage}
                            onClick={(e) => {
                              e.preventDefault();
                              setPage(item);
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        onClick={(e) => {
                          e.preventDefault();
                          setPage((p) => Math.min(totalPages, p + 1));
                        }}
                        aria-disabled={safePage === totalPages}
                        className={cn(
                          safePage === totalPages &&
                            "pointer-events-none opacity-50 cursor-not-allowed"
                        )}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Build a compact page-number list with ellipses for large ranges,
// mirroring the standard shadcn pagination behavior.
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
