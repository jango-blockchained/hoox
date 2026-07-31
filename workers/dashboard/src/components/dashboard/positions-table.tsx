"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PositionsSummary } from "@/components/dashboard/positions-summary";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  AlertCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  api,
  isTestnetPosition,
  type Position as ApiPosition,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/** Normalized row used throughout the positions UI. */
export interface PositionRow {
  id: string;
  exchange: string;
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number | null;
  currentPrice: number | null;
  pnl: number;
  pnlPercent: number | null;
  leverage: number | null;
  status: string;
  openedAt: number | null;
  updatedAt: number | null;
  liquidationPrice: number | null;
}

type ModeFilter = "live" | "test" | "all";
type SortField =
  | "symbol"
  | "exchange"
  | "side"
  | "size"
  | "pnl"
  | "leverage"
  | "updatedAt";
type SortDir = "asc" | "desc";

const REFRESH_INTERVAL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 250;

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** D1 stores unix seconds; some payloads may use ms. */
function toMs(ts: number | null): number | null {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return null;
  return ts < 1e12 ? ts * 1000 : ts;
}

function formatTimeAgo(timestampMs: number | null): string {
  if (timestampMs == null) return "—";
  const seconds = Math.floor((Date.now() - timestampMs) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 1000 ? 2 : 6,
  })}`;
}

function formatSize(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 1 ? 4 : 8,
  });
}

function normalizeSide(side: unknown): "LONG" | "SHORT" {
  const s = String(side ?? "")
    .toUpperCase()
    .trim();
  if (s === "SHORT" || s === "SELL" || s === "S") return "SHORT";
  return "LONG";
}

/**
 * Map API / D1 rows (camelCase from typed client, snake_case from raw D1)
 * into a stable UI shape. Missing mark/entry still renders safely.
 */
function normalizePosition(raw: unknown): PositionRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = String(r.id ?? "");
  if (!id) return null;

  const exchange = String(r.exchange ?? "").toLowerCase();
  const symbol = String(r.symbol ?? "");
  if (!exchange || !symbol) return null;

  const side = normalizeSide(r.side);
  const size = toNumber(r.size) ?? 0;
  const entryPrice = toNumber(r.entryPrice) ?? toNumber(r.entry_price) ?? null;
  const currentPrice =
    toNumber(r.currentPrice) ??
    toNumber(r.mark_price) ??
    toNumber(r.markPrice) ??
    null;
  const pnl =
    toNumber(r.pnl) ??
    toNumber(r.unrealizedPnl) ??
    toNumber(r.unrealized_pnl) ??
    0;
  const leverage =
    toNumber(r.leverage) != null
      ? Math.round(toNumber(r.leverage) as number)
      : null;

  let pnlPercent = toNumber(r.pnlPercent) ?? toNumber(r.pnl_percent);
  if (
    pnlPercent == null &&
    entryPrice != null &&
    entryPrice > 0 &&
    size !== 0
  ) {
    const notional = Math.abs(entryPrice * size);
    if (notional > 0) {
      pnlPercent = (pnl / notional) * 100;
    }
  }

  const openedAt = toMs(toNumber(r.openedAt) ?? toNumber(r.opened_at) ?? null);
  const updatedAt = toMs(
    toNumber(r.updatedAt) ?? toNumber(r.updated_at) ?? null
  );
  const liquidationPrice =
    toNumber(r.liquidationPrice) ?? toNumber(r.liquidation_price) ?? null;

  return {
    id,
    exchange,
    symbol,
    side,
    size,
    entryPrice,
    currentPrice,
    pnl,
    pnlPercent,
    leverage,
    status: String(r.status ?? "OPEN").toUpperCase(),
    openedAt,
    updatedAt,
    liquidationPrice,
  };
}

function modeLabel(mode: ModeFilter): string {
  if (mode === "live") return "Live only";
  if (mode === "test") return "Testnet only";
  return "Live + testnet";
}

export function PositionsTable() {
  const searchId = useId();
  const exchangeId = useId();
  const sideId = useId();
  const modeId = useId();
  const autoRefreshId = useId();

  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState("all");
  /** Default live-only so testnet rows do not pollute the main book view. */
  const [modeFilter, setModeFilter] = useState<ModeFilter>("live");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Debounce free-text search for smoother typing on large books.
  useEffect(() => {
    const handle = setTimeout(
      () => setSearchQuery(searchInput.trim()),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchPositions = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setIsRefreshing(true);
    try {
      const data = await api.getPositions();
      if (!mountedRef.current) return;
      if (data.success && Array.isArray(data.positions)) {
        const rows = (data.positions as ApiPosition[])
          .map((p) => normalizePosition(p))
          .filter((p): p is PositionRow => p != null);
        setPositions(rows);
        setError(null);
        setLastUpdated(Date.now());
      } else {
        setError("Positions response was incomplete.");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof Error ? err.message : "Failed to fetch positions";
      setError(message);
      if (!silent) {
        toast.error("Failed to load positions", { description: message });
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Initial load + optional auto-refresh.
  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchPositions({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchPositions]);

  const handleClosePosition = async (position: PositionRow) => {
    setClosingPosition(position.id);
    const isTest = isTestnetPosition(position);
    try {
      const result = await api.closePosition(
        position.exchange,
        position.symbol,
        position.side,
        position.size,
        { test: isTest }
      );
      if (result.success) {
        setPositions((prev) => prev.filter((p) => p.id !== position.id));
        toast.success(
          isTest ? "Testnet position closed" : "Position closed successfully",
          {
            description: `${position.symbol} on ${position.exchange}${isTest ? " (testnet)" : ""} has been closed.`,
          }
        );
      } else {
        toast.error("Failed to close position", {
          description: result.error || "Unknown error",
        });
      }
    } catch (err) {
      toast.error("Failed to close position", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setClosingPosition(null);
    }
  };

  const exchanges = useMemo(() => {
    const set = new Set(positions.map((p) => p.exchange));
    return Array.from(set).sort();
  }, [positions]);

  const filteredPositions = useMemo(() => {
    const needle = searchQuery.toLowerCase();
    return positions.filter((pos) => {
      const matchesSearch =
        !needle ||
        pos.symbol.toLowerCase().includes(needle) ||
        pos.exchange.toLowerCase().includes(needle);
      const matchesExchange =
        exchangeFilter === "all" || pos.exchange === exchangeFilter;
      const matchesSide = sideFilter === "all" || pos.side === sideFilter;
      const isTest = isTestnetPosition(pos);
      const matchesMode =
        modeFilter === "all" ||
        (modeFilter === "test" && isTest) ||
        (modeFilter === "live" && !isTest);
      return matchesSearch && matchesExchange && matchesSide && matchesMode;
    });
  }, [positions, searchQuery, exchangeFilter, sideFilter, modeFilter]);

  const sortedPositions = useMemo(() => {
    const arr = [...filteredPositions];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "exchange":
          cmp = a.exchange.localeCompare(b.exchange);
          break;
        case "side":
          cmp = a.side.localeCompare(b.side);
          break;
        case "size":
          cmp = a.size - b.size;
          break;
        case "pnl":
          cmp = a.pnl - b.pnl;
          break;
        case "leverage":
          cmp = (a.leverage ?? 0) - (b.leverage ?? 0);
          break;
        case "updatedAt":
          cmp = (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredPositions, sortField, sortDir]);

  const summaryStats = useMemo(() => {
    let totalUnrealizedPnl = 0;
    let longCount = 0;
    let shortCount = 0;
    let totalNotional = 0;
    for (const pos of filteredPositions) {
      totalUnrealizedPnl += pos.pnl || 0;
      if (pos.side === "LONG") longCount += 1;
      else shortCount += 1;
      const mark = pos.currentPrice ?? pos.entryPrice;
      if (mark != null) totalNotional += Math.abs(mark * pos.size);
    }
    return {
      openCount: filteredPositions.length,
      totalUnrealizedPnl,
      longCount,
      shortCount,
      totalNotional,
      modeLabel: modeLabel(modeFilter),
    };
  }, [filteredPositions, modeFilter]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "symbol" || field === "exchange" ? "asc" : "desc");
    }
  }

  function SortButton({
    field,
    children,
    className,
  }: {
    field: SortField;
    children: ReactNode;
    className?: string;
  }) {
    const active = sortField === field;
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
          active && "text-foreground",
          className
        )}
        aria-label={`Sort by ${field}${active ? `, currently ${sortDir}ending` : ""}`}
      >
        {children}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />
        )}
      </button>
    );
  }

  const hasActiveFilters =
    searchQuery !== "" ||
    exchangeFilter !== "all" ||
    sideFilter !== "all" ||
    modeFilter !== "live";

  function clearFilters() {
    setSearchInput("");
    setSearchQuery("");
    setExchangeFilter("all");
    setSideFilter("all");
    setModeFilter("live");
  }

  function renderCloseControl(position: PositionRow, alwaysVisible = false) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 text-destructive transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100",
              alwaysVisible
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            )}
            disabled={closingPosition === position.id}
            aria-label={`Close ${position.side} ${position.symbol} on ${position.exchange}`}
          >
            {closingPosition === position.id ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            <span className="ml-1 text-xs">Close</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close position</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Close your{" "}
                  <span className="font-medium text-foreground">
                    {position.symbol}
                  </span>{" "}
                  <span
                    className={
                      position.side === "LONG"
                        ? "text-success"
                        : "text-destructive"
                    }
                  >
                    {position.side.toLowerCase()}
                  </span>{" "}
                  on{" "}
                  <span className="capitalize font-medium text-foreground">
                    {position.exchange}
                  </span>
                  {isTestnetPosition(position) ? " (testnet)" : ""}?
                </p>
                <p>
                  Size {formatSize(position.size)} · Unrealized PnL{" "}
                  <span
                    className={
                      position.pnl >= 0 ? "text-success" : "text-destructive"
                    }
                  >
                    {position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)}
                  </span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleClosePosition(position)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Close position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  function renderSide(side: "LONG" | "SHORT") {
    const isLong = side === "LONG";
    return (
      <div className="flex items-center gap-1.5">
        {isLong ? (
          <ArrowUpRight className="h-3.5 w-3.5 text-success" aria-hidden />
        ) : (
          <ArrowDownRight
            className="h-3.5 w-3.5 text-destructive"
            aria-hidden
          />
        )}
        <span
          className={cn(
            "text-xs font-semibold tracking-wide",
            isLong ? "text-success" : "text-destructive"
          )}
        >
          {side}
        </span>
      </div>
    );
  }

  function renderPnl(position: PositionRow) {
    const positive = position.pnl > 0;
    const negative = position.pnl < 0;
    const color = positive
      ? "text-success"
      : negative
        ? "text-destructive"
        : "text-muted-foreground";
    return (
      <div className="flex flex-col items-end">
        <span
          className={cn("font-mono text-sm font-medium tabular-nums", color)}
        >
          {positive ? "+" : ""}
          {position.pnl.toFixed(2)}
        </span>
        {position.pnlPercent != null && (
          <span className={cn("text-xs tabular-nums", color)}>
            {position.pnlPercent >= 0 ? "+" : ""}
            {position.pnlPercent.toFixed(2)}%
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm font-medium">
                Active positions
              </CardTitle>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {summaryStats.openCount} open
              </Badge>
              {modeFilter !== "all" && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {modeFilter === "live" ? "Live" : "Testnet"}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              {lastUpdated
                ? `Updated ${formatTimeAgo(lastUpdated)}`
                : "Ledger-backed open book"}
              {autoRefresh ? " · auto-refresh on" : " · auto-refresh off"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id={autoRefreshId}
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                size="sm"
                aria-label="Toggle auto-refresh every 30 seconds"
              />
              <Label
                htmlFor={autoRefreshId}
                className="cursor-pointer text-xs text-muted-foreground"
              >
                Auto-refresh
              </Label>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={() => void fetchPositions()}
              disabled={isRefreshing || loading}
              aria-label="Refresh positions now"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>

        <PositionsSummary
          stats={summaryStats}
          loading={loading}
          className="mt-4"
        />

        {/* Filters — labelled for keyboard / SR users */}
        <div
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          role="search"
          aria-label="Filter positions"
        >
          <div className="relative min-w-[200px] flex-1">
            <Label htmlFor={searchId} className="sr-only">
              Search symbol or exchange
            </Label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={searchId}
              type="search"
              placeholder="Search symbol or exchange…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 pl-9"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label
              htmlFor={exchangeId}
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              Exchange
            </Label>
            <Select value={exchangeFilter} onValueChange={setExchangeFilter}>
              <SelectTrigger
                id={exchangeId}
                className="h-9 w-full sm:w-[140px]"
                aria-label="Filter by exchange"
              >
                <SelectValue placeholder="Exchange" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exchanges</SelectItem>
                {exchanges.map((ex) => (
                  <SelectItem key={ex} value={ex} className="capitalize">
                    {ex}
                  </SelectItem>
                ))}
                {/* Ensure common venues appear even when book is empty */}
                {["binance", "mexc", "bybit"]
                  .filter((ex) => !exchanges.includes(ex))
                  .map((ex) => (
                    <SelectItem key={ex} value={ex} className="capitalize">
                      {ex}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label
              htmlFor={sideId}
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              Side
            </Label>
            <Select value={sideFilter} onValueChange={setSideFilter}>
              <SelectTrigger
                id={sideId}
                className="h-9 w-full sm:w-[120px]"
                aria-label="Filter by side"
              >
                <SelectValue placeholder="Side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sides</SelectItem>
                <SelectItem value="LONG">Long</SelectItem>
                <SelectItem value="SHORT">Short</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label
              htmlFor={modeId}
              className="text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              Mode
            </Label>
            <Select
              value={modeFilter}
              onValueChange={(v) => setModeFilter(v as ModeFilter)}
            >
              <SelectTrigger
                id={modeId}
                className="h-9 w-full sm:w-[130px]"
                aria-label="Filter by live or testnet"
              >
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">Live only</SelectItem>
                <SelectItem value="test">Testnet</SelectItem>
                <SelectItem value="all">Live + test</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground"
              onClick={clearFilters}
            >
              Reset filters
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {loading && positions.length === 0 ? (
          <div
            className="space-y-3"
            aria-busy="true"
            aria-label="Loading positions"
          >
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-3/4" />
          </div>
        ) : error && positions.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-14 text-center"
            role="alert"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Could not load positions
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void fetchPositions()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : sortedPositions.length === 0 ? (
          <EmptyState
            icon="positions"
            title={
              positions.length === 0
                ? "No open positions"
                : "No positions match filters"
            }
            description={
              positions.length === 0
                ? "When the trade worker opens a position it will appear here in real time."
                : "Try adjusting exchange, side, mode, or search."
            }
            action={
              positions.length === 0
                ? {
                    label: "Refresh",
                    onClick: () => void fetchPositions(),
                    icon: "refresh",
                  }
                : {
                    label: "Reset filters",
                    onClick: clearFilters,
                  }
            }
          />
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
              <div className="max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">
                        <SortButton field="exchange">Exchange</SortButton>
                      </TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="symbol">Symbol</SortButton>
                      </TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="side">Side</SortButton>
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        <SortButton field="size" className="ml-auto">
                          Size
                        </SortButton>
                      </TableHead>
                      <TableHead className="text-right text-xs text-muted-foreground">
                        Entry
                      </TableHead>
                      <TableHead className="text-right text-xs text-muted-foreground">
                        Mark
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        <SortButton field="pnl" className="ml-auto">
                          PnL
                        </SortButton>
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        <SortButton field="leverage" className="ml-auto">
                          Lev
                        </SortButton>
                      </TableHead>
                      <TableHead className="text-xs">
                        <SortButton field="updatedAt">Updated</SortButton>
                      </TableHead>
                      <TableHead className="text-right text-xs text-muted-foreground">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {sortedPositions.map((position) => (
                        <motion.tr
                          key={position.id}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -12 }}
                          className="group border-b border-border transition-colors hover:bg-secondary/30 focus-within:bg-secondary/20"
                        >
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="text-xs capitalize"
                              >
                                {position.exchange}
                              </Badge>
                              {isTestnetPosition(position) && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] uppercase tracking-wide"
                                >
                                  TEST
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {position.symbol}
                          </TableCell>
                          <TableCell>{renderSide(position.side)}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatSize(position.size)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                            {formatPrice(position.entryPrice)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatPrice(position.currentPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            {renderPnl(position)}
                          </TableCell>
                          <TableCell className="text-right">
                            {position.leverage != null ? (
                              <Badge
                                variant="secondary"
                                className="font-mono text-xs tabular-nums"
                              >
                                {position.leverage}x
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTimeAgo(position.updatedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {renderCloseControl(position)}
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile stacked cards */}
            <div className="flex flex-col gap-3 md:hidden" role="list">
              <AnimatePresence initial={false}>
                {sortedPositions.map((position) => (
                  <motion.article
                    key={position.id}
                    role="listitem"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="rounded-lg border border-border/70 bg-secondary/15 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold">
                            {position.symbol}
                          </span>
                          {renderSide(position.side)}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] capitalize"
                          >
                            {position.exchange}
                          </Badge>
                          {isTestnetPosition(position) && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] uppercase"
                            >
                              TEST
                            </Badge>
                          )}
                          {position.leverage != null && (
                            <Badge
                              variant="secondary"
                              className="font-mono text-[10px]"
                            >
                              {position.leverage}x
                            </Badge>
                          )}
                        </div>
                      </div>
                      {renderPnl(position)}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Size</dt>
                        <dd className="font-mono tabular-nums">
                          {formatSize(position.size)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Updated</dt>
                        <dd>{formatTimeAgo(position.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Entry</dt>
                        <dd className="font-mono tabular-nums">
                          {formatPrice(position.entryPrice)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Mark</dt>
                        <dd className="font-mono tabular-nums">
                          {formatPrice(position.currentPrice)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex justify-end">
                      {renderCloseControl(position, true)}
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>

            {error && (
              <p
                className="mt-3 flex items-center gap-1.5 text-xs text-destructive"
                role="status"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Last refresh failed: {error}. Showing cached rows.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
