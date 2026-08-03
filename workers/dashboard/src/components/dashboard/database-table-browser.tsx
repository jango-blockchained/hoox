"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  AlertCircle,
  Hash,
  Type,
  KeyRound,
  Search,
  Database as DatabaseIcon,
  Table2,
  LayoutGrid,
  Shield,
  Lock,
  Eye,
  Columns3,
  Rows3,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SchemaViewer } from "@/components/dashboard/schema-viewer";

// ── Static D1 schema knowledge ────────────────────────────────────────
//
// Mirrors d1-worker TABLE_ALLOWLIST in workers/d1-worker/src/index.ts.
// Kept in sync manually until d1-worker exposes a /schema endpoint.
// Tables: trade_signals, trades, positions, balances, system_logs,
//         trade_requests, trade_responses
//
// We do not query SQLite's `sqlite_master` here because the d1-worker
// /query endpoint requires the X-Internal-Auth-Key header which is not
// available in the browser. See lib/api.ts → queryTable for the
// best-effort path that does attempt a real fetch on demand.

type ColumnType = "INTEGER" | "TEXT" | "REAL" | "BOOLEAN";

interface ColumnDef {
  name: string;
  type: ColumnType;
  primaryKey?: boolean;
  nullable?: boolean;
}

interface TableDef {
  id: string;
  label: string;
  d1Name: string;
  description: string;
  columns: ColumnDef[];
  /** Subset of columns rendered in the row preview table. */
  sampleColumns: string[];
}

const KNOWN_TABLES: readonly TableDef[] = [
  {
    id: "signals",
    label: "Signals",
    d1Name: "trade_signals",
    description: "Incoming trade signals from webhooks and email parsers",
    columns: [
      { name: "id", type: "INTEGER", primaryKey: true },
      { name: "timestamp", type: "INTEGER" },
      { name: "exchange", type: "TEXT" },
      { name: "symbol", type: "TEXT" },
      { name: "side", type: "TEXT" },
      { name: "price", type: "REAL" },
      { name: "confidence", type: "REAL", nullable: true },
      { name: "source", type: "TEXT" },
      { name: "metadata", type: "TEXT", nullable: true },
    ],
    sampleColumns: [
      "timestamp",
      "exchange",
      "symbol",
      "side",
      "price",
      "source",
    ],
  },
  {
    id: "positions",
    label: "Positions",
    d1Name: "positions",
    description: "Active and historical trading positions across exchanges",
    columns: [
      { name: "id", type: "INTEGER", primaryKey: true },
      { name: "exchange", type: "TEXT" },
      { name: "symbol", type: "TEXT" },
      { name: "side", type: "TEXT" },
      { name: "size", type: "REAL" },
      { name: "entry_price", type: "REAL" },
      { name: "exit_price", type: "REAL", nullable: true },
      { name: "leverage", type: "INTEGER" },
      { name: "status", type: "TEXT" },
      { name: "opened_at", type: "INTEGER" },
      { name: "updated_at", type: "INTEGER" },
    ],
    sampleColumns: [
      "exchange",
      "symbol",
      "side",
      "size",
      "status",
      "updated_at",
    ],
  },
  {
    id: "trades",
    label: "Trades",
    d1Name: "trades",
    description: "Executed trade records linked to their originating signals",
    columns: [
      { name: "id", type: "INTEGER", primaryKey: true },
      { name: "signal_id", type: "INTEGER" },
      { name: "exchange", type: "TEXT" },
      { name: "symbol", type: "TEXT" },
      { name: "side", type: "TEXT" },
      { name: "quantity", type: "REAL" },
      { name: "entry_price", type: "REAL" },
      { name: "exit_price", type: "REAL", nullable: true },
      { name: "pnl", type: "REAL" },
      { name: "status", type: "TEXT" },
      { name: "opened_at", type: "INTEGER" },
      { name: "closed_at", type: "INTEGER", nullable: true },
    ],
    sampleColumns: ["exchange", "symbol", "side", "quantity", "pnl", "status"],
  },
  {
    id: "agent_logs",
    label: "Agent Logs",
    d1Name: "system_logs",
    description: "Structured log entries from all workers and AI agents",
    columns: [
      { name: "id", type: "INTEGER", primaryKey: true },
      { name: "timestamp", type: "INTEGER" },
      { name: "level", type: "TEXT" },
      { name: "module", type: "TEXT" },
      { name: "message", type: "TEXT" },
      { name: "context", type: "TEXT", nullable: true },
    ],
    sampleColumns: ["timestamp", "level", "module", "message"],
  },
] as const;

const COLUMN_TYPE_BADGE: Record<ColumnType, string> = {
  INTEGER: "border-primary/30 bg-primary/10 text-primary",
  TEXT: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  REAL: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  BOOLEAN: "border-warning/30 bg-warning/10 text-warning",
};

const TYPE_ICON: Record<ColumnType, typeof Hash> = {
  INTEGER: Hash,
  TEXT: Type,
  REAL: Type,
  BOOLEAN: Type,
};

// ── Per-table runtime state ───────────────────────────────────────────

interface TableState {
  count: number | null;
  rows: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
  /** True when error is auth-related (401 / missing key). */
  authError: boolean;
  lastFetched: number | null;
  /** True once the user (or auto-load) has attempted a fetch. */
  hasAttempted: boolean;
}

const INITIAL_STATE: TableState = {
  count: null,
  rows: [],
  loading: false,
  error: null,
  authError: false,
  lastFetched: null,
  hasAttempted: false,
};

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Format a cell value for display. Numbers that look like Unix timestamps
 * (seconds or milliseconds) are converted to ISO date strings; everything
 * else is coerced to a string. NULL and undefined render as an em dash.
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      // Seconds (≈2001-2286)
      if (value >= 1_000_000_000 && value < 100_000_000_000) {
        return new Date(value * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      }
      // Milliseconds (≈2001-2286)
      if (value >= 100_000_000_000 && value < 1_000_000_000_000_000) {
        return new Date(value).toISOString().slice(0, 19).replace("T", " ");
      }
      return String(value);
    }
    return String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isAuthFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    m.includes("auth") ||
    m.includes("internal-auth") ||
    m.includes("x-internal")
  );
}

function relativeTime(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

// ── Component ─────────────────────────────────────────────────────────

export function DatabaseTableBrowser() {
  const [activeTab, setActiveTab] = useState<string>(KNOWN_TABLES[0].id);
  /** Per-table search so switching tables doesn't leak filters. */
  const [searchByTable, setSearchByTable] = useState<Record<string, string>>(
    {}
  );
  const [states, setStates] = useState<Record<string, TableState>>(() =>
    Object.fromEntries(KNOWN_TABLES.map((t) => [t.id, { ...INITIAL_STATE }]))
  );

  const fetchTable = useCallback(async (tableId: string) => {
    const table = KNOWN_TABLES.find((t) => t.id === tableId);
    if (!table) return;
    setStates((prev) => ({
      ...prev,
      [tableId]: {
        ...prev[tableId],
        loading: true,
        error: null,
        authError: false,
        hasAttempted: true,
      },
    }));
    try {
      const result = await api.queryTable(table.d1Name, 20);
      setStates((prev) => ({
        ...prev,
        [tableId]: {
          count: result.count,
          rows: result.rows,
          loading: false,
          error: null,
          authError: false,
          lastFetched: Date.now(),
          hasAttempted: true,
        },
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch table";
      setStates((prev) => ({
        ...prev,
        [tableId]: {
          ...prev[tableId],
          loading: false,
          error: message,
          authError: isAuthFailure(message),
          hasAttempted: true,
        },
      }));
    }
  }, []);

  // Auto-load each table once on first selection (ref avoids re-entry loops).
  const autoLoaded = useRef(new Set<string>());
  useEffect(() => {
    if (autoLoaded.current.has(activeTab)) return;
    autoLoaded.current.add(activeTab);
    void fetchTable(activeTab);
  }, [activeTab, fetchTable]);

  const activeTable =
    KNOWN_TABLES.find((t) => t.id === activeTab) ?? KNOWN_TABLES[0];
  const activeState = states[activeTable.id] ?? INITIAL_STATE;
  const searchQuery = searchByTable[activeTable.id] ?? "";

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return activeState.rows;
    const q = searchQuery.toLowerCase();
    return activeState.rows.filter((row) =>
      Object.values(row).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q)
      )
    );
  }, [activeState.rows, searchQuery]);

  const anyAuthError = Object.values(states).some((s) => s.authError);
  const loadedCount = Object.values(states).filter(
    (s) => s.lastFetched !== null && !s.error
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Permissions strip — always visible so the mental model is clear */}
      <Alert className="border-border/60 bg-secondary/20">
        <Shield className="h-4 w-4 text-primary" />
        <AlertTitle className="flex items-center gap-2 text-sm">
          Read-only explorer
          <Badge variant="outline" className="font-mono text-[10px]">
            SELECT only
          </Badge>
        </AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Queries run against d1-worker with a scoped read key. No inserts,
          updates, or deletes are available from this surface.
          {anyAuthError ? (
            <span className="mt-1 block text-warning">
              Auth failed on at least one table — set{" "}
              <code className="rounded bg-secondary/50 px-1 font-mono">
                D1_READ_KEY_BINDING
              </code>{" "}
              (or fallbacks) via the setup wizard / CLI.
            </span>
          ) : null}
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="data" className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="data">
              <Table2 className="h-3.5 w-3.5" />
              Data
            </TabsTrigger>
            <TabsTrigger value="schema">
              <LayoutGrid className="h-3.5 w-3.5" />
              Schema
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Table2 className="h-3 w-3" />
              {KNOWN_TABLES.length} tables
            </span>
            <span className="text-border">·</span>
            <span>
              {loadedCount}/{KNOWN_TABLES.length} loaded
            </span>
          </div>
        </div>

        <TabsContent value="data" className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            {/* Table list — faster mental model */}
            <Card className="border-border bg-card h-fit shadow-2xl shadow-primary/5 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Tables</CardTitle>
                <CardDescription className="text-xs">
                  Select a table to preview rows
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 p-2 pt-0">
                {KNOWN_TABLES.map((table) => {
                  const state = states[table.id] ?? INITIAL_STATE;
                  const selected = activeTab === table.id;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => setActiveTab(table.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                        selected
                          ? "border-primary/40 bg-primary/10"
                          : "border-transparent hover:border-border/60 hover:bg-secondary/40"
                      )}
                      aria-current={selected ? "true" : undefined}
                    >
                      <DatabaseIcon
                        className={cn(
                          "mt-0.5 h-3.5 w-3.5 shrink-0",
                          selected ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              "truncate text-xs font-medium",
                              selected
                                ? "text-foreground"
                                : "text-foreground/90"
                            )}
                          >
                            {table.label}
                          </span>
                          {state.loading ? (
                            <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                          ) : state.authError ? (
                            <Lock className="h-3 w-3 shrink-0 text-warning" />
                          ) : state.error ? (
                            <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
                          ) : state.count !== null ? (
                            <Badge
                              variant="secondary"
                              className="h-5 shrink-0 px-1.5 font-mono text-[10px]"
                            >
                              {state.count.toLocaleString()}
                            </Badge>
                          ) : null}
                        </div>
                        <code className="block truncate font-mono text-[10px] text-muted-foreground">
                          {table.d1Name}
                        </code>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Active table detail */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    {activeTable.label}
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] font-normal"
                    >
                      {activeTable.d1Name}
                    </Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {activeTable.description}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Columns3 className="h-3 w-3" />
                      {activeTable.columns.length} columns
                    </span>
                    <span className="flex items-center gap-1">
                      <Rows3 className="h-3 w-3" />
                      {activeState.count === null
                        ? "count unknown"
                        : `${activeState.count.toLocaleString()} rows`}
                    </span>
                    {activeState.lastFetched ? (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Fetched {relativeTime(activeState.lastFetched)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchTable(activeTable.id)}
                  disabled={activeState.loading}
                  className="shrink-0 gap-1.5"
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5",
                      activeState.loading && "animate-spin"
                    )}
                  />
                  {activeState.hasAttempted ? "Refresh" : "Load rows"}
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
                {/* Column strip */}
                <Card className="border-border bg-card shadow-2xl shadow-primary/5 backdrop-blur-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Columns3 className="h-3.5 w-3.5 text-primary" />
                      Columns
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Static catalog · PK marked with key icon
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[280px]">
                      <div className="flex flex-col gap-1.5 pr-3">
                        {activeTable.columns.map((col) => {
                          const Icon = TYPE_ICON[col.type];
                          return (
                            <div
                              key={col.name}
                              className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-secondary/20 px-2.5 py-1.5"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {col.primaryKey ? (
                                  <KeyRound className="h-3 w-3 shrink-0 text-warning" />
                                ) : null}
                                <code className="truncate font-mono text-xs text-foreground">
                                  {col.name}
                                </code>
                                {col.nullable ? (
                                  <span
                                    className="text-[10px] text-muted-foreground"
                                    title="Nullable"
                                  >
                                    ?
                                  </span>
                                ) : null}
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "shrink-0 gap-1 font-mono text-[10px]",
                                  COLUMN_TYPE_BADGE[col.type]
                                )}
                              >
                                <Icon className="h-2.5 w-2.5" />
                                {col.type}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Row preview */}
                <Card className="border-border bg-card shadow-2xl shadow-primary/5 backdrop-blur-xl">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Rows3 className="h-3.5 w-3.5 text-primary" />
                          Recent rows
                          {activeState.lastFetched ? (
                            <Badge
                              variant="secondary"
                              className="font-normal text-[10px]"
                            >
                              {new Date(
                                activeState.lastFetched
                              ).toLocaleTimeString()}
                            </Badge>
                          ) : null}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Last 20 · newest first · filter client-side
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {activeState.error ? (
                      <Alert
                        variant={
                          activeState.authError ? "default" : "destructive"
                        }
                        className={
                          activeState.authError
                            ? "border-warning/40 bg-warning/5"
                            : undefined
                        }
                      >
                        {activeState.authError ? (
                          <Lock className="h-4 w-4 text-warning" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <AlertTitle>
                          {activeState.authError
                            ? "Read access denied"
                            : `Failed to fetch ${activeTable.label.toLowerCase()}`}
                        </AlertTitle>
                        <AlertDescription className="flex flex-col gap-3">
                          <span className="text-xs">
                            {activeState.authError
                              ? "d1-worker rejected the query (missing or invalid internal read key). The explorer is read-only and needs D1_READ_KEY_BINDING configured on the dashboard / d1-worker."
                              : activeState.error}
                          </span>
                          <div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fetchTable(activeTable.id)}
                              disabled={activeState.loading}
                              className="gap-1.5"
                            >
                              <RefreshCw
                                className={cn(
                                  "h-3.5 w-3.5",
                                  activeState.loading && "animate-spin"
                                )}
                              />
                              Retry
                            </Button>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ) : activeState.loading ? (
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-3/4" />
                      </div>
                    ) : !activeState.hasAttempted ? (
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <DatabaseIcon />
                          </EmptyMedia>
                          <EmptyTitle>Ready to load</EmptyTitle>
                          <EmptyDescription>
                            Query{" "}
                            <code className="font-mono text-foreground">
                              {activeTable.d1Name}
                            </code>{" "}
                            for a live row preview (read-only).
                          </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                          <Button
                            size="sm"
                            onClick={() => fetchTable(activeTable.id)}
                            className="gap-1.5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Load rows
                          </Button>
                        </EmptyContent>
                      </Empty>
                    ) : activeState.rows.length === 0 ? (
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <DatabaseIcon />
                          </EmptyMedia>
                          <EmptyTitle>Table is empty</EmptyTitle>
                          <EmptyDescription>
                            <code className="font-mono text-foreground">
                              {activeTable.d1Name}
                            </code>{" "}
                            returned 0 rows. Signals and trades will appear here
                            after the system processes activity.
                          </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fetchTable(activeTable.id)}
                            className="gap-1.5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Refresh
                          </Button>
                        </EmptyContent>
                      </Empty>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Filter rows…"
                            value={searchQuery}
                            onChange={(e) =>
                              setSearchByTable((prev) => ({
                                ...prev,
                                [activeTable.id]: e.target.value,
                              }))
                            }
                            className="h-9 pl-9"
                            aria-label={`Filter ${activeTable.label} rows`}
                          />
                        </div>
                        {searchQuery.trim() ? (
                          <p className="text-[11px] text-muted-foreground">
                            Showing {filteredRows.length} of{" "}
                            {activeState.rows.length} loaded rows
                          </p>
                        ) : null}
                        <ScrollArea className="h-[260px] rounded-md border border-border">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-muted">
                              <TableRow>
                                {activeTable.sampleColumns.map((col) => (
                                  <TableHead
                                    key={col}
                                    className="whitespace-nowrap text-xs text-muted-foreground"
                                  >
                                    {col}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredRows.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={activeTable.sampleColumns.length}
                                    className="h-16 text-center text-sm text-muted-foreground"
                                  >
                                    No rows match &ldquo;{searchQuery}&rdquo;
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredRows.map((row, idx) => (
                                  <TableRow key={idx}>
                                    {activeTable.sampleColumns.map((col) => (
                                      <TableCell
                                        key={col}
                                        className="whitespace-nowrap font-mono text-xs"
                                      >
                                        {formatCellValue(row[col])}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                          <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schema">
          <SchemaViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
