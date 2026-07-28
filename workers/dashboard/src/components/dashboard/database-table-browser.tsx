"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from "react";
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
  lastFetched: number | null;
}

const INITIAL_STATE: TableState = {
  count: null,
  rows: [],
  loading: false,
  error: null,
  lastFetched: null,
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

// ── Component ─────────────────────────────────────────────────────────

export function DatabaseTableBrowser() {
  const [activeTab, setActiveTab] = useState<string>(KNOWN_TABLES[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [states, setStates] = useState<Record<string, TableState>>(() =>
    Object.fromEntries(KNOWN_TABLES.map((t) => [t.id, { ...INITIAL_STATE }]))
  );

  const fetchTable = useCallback(async (tableId: string) => {
    const table = KNOWN_TABLES.find((t) => t.id === tableId);
    if (!table) return;
    setStates((prev) => ({
      ...prev,
      [tableId]: { ...prev[tableId], loading: true, error: null },
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
          lastFetched: Date.now(),
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
        },
      }));
    }
  }, []);

  const activeTable =
    KNOWN_TABLES.find((t) => t.id === activeTab) ?? KNOWN_TABLES[0];
  const activeState = states[activeTable.id] ?? INITIAL_STATE;

  const filteredRows = activeState.rows.filter((row) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return Object.values(row).some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue="data" className="w-full">
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

        <TabsContent value="data" className="flex flex-col gap-4">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList>
              {KNOWN_TABLES.map((table) => (
                <TabsTrigger key={table.id} value={table.id}>
                  {table.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {KNOWN_TABLES.map((table) => {
              const state = states[table.id] ?? INITIAL_STATE;
              return (
                <TabsContent
                  key={table.id}
                  value={table.id}
                  className="flex flex-col gap-4"
                >
                  <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-1">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <DatabaseIcon className="h-4 w-4 text-primary" />
                              Schema
                            </CardTitle>
                            <CardDescription>
                              {table.description}
                            </CardDescription>
                          </div>
                          <Badge
                            variant="outline"
                            className="shrink-0 font-mono text-[10px]"
                          >
                            {table.d1Name}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[280px]">
                          <div className="flex flex-col gap-1.5 pr-3">
                            {table.columns.map((col) => {
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
                                      <span className="text-[10px] text-muted-foreground">
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

                    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-1">
                            <CardTitle className="flex items-center gap-2 text-base">
                              Recent Rows
                              {state.lastFetched ? (
                                <Badge
                                  variant="secondary"
                                  className="font-normal text-[10px]"
                                >
                                  {new Date(
                                    state.lastFetched
                                  ).toLocaleTimeString()}
                                </Badge>
                              ) : null}
                            </CardTitle>
                            <CardDescription>
                              Last 20 rows · total:{" "}
                              {state.count === null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="font-medium text-foreground">
                                  {state.count.toLocaleString()}
                                </span>
                              )}
                            </CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchTable(table.id)}
                            disabled={state.loading}
                            className="shrink-0 gap-1.5"
                          >
                            <RefreshCw
                              className={cn(
                                "h-3.5 w-3.5",
                                state.loading && "animate-spin"
                              )}
                            />
                            Refresh
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {state.error ? (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>
                              Failed to fetch {table.label.toLowerCase()}
                            </AlertTitle>
                            <AlertDescription>{state.error}</AlertDescription>
                          </Alert>
                        ) : state.loading ? (
                          <div className="flex flex-col gap-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-3/4" />
                          </div>
                        ) : state.rows.length === 0 ? (
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <DatabaseIcon />
                              </EmptyMedia>
                              <EmptyTitle>No data fetched</EmptyTitle>
                              <EmptyDescription>
                                Click refresh to query{" "}
                                <code className="font-mono text-foreground">
                                  {table.d1Name}
                                </code>{" "}
                                via d1-worker. Row count and recent rows will
                                appear after a successful fetch.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                placeholder="Filter rows…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 pl-9"
                                aria-label="Filter table rows"
                              />
                            </div>
                            <ScrollArea className="h-[220px] rounded-md border border-border">
                              <Table>
                                <TableHeader className="sticky top-0 z-10 bg-muted">
                                  <TableRow>
                                    {table.sampleColumns.map((col) => (
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
                                        colSpan={table.sampleColumns.length}
                                        className="h-16 text-center text-sm text-muted-foreground"
                                      >
                                        No rows match &ldquo;{searchQuery}
                                        &rdquo;
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    filteredRows.map((row, idx) => (
                                      <TableRow key={idx}>
                                        {table.sampleColumns.map((col) => (
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
                </TabsContent>
              );
            })}
          </Tabs>
        </TabsContent>

        <TabsContent value="schema">
          <SchemaViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
