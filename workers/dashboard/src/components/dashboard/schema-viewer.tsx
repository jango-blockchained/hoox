"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  GitBranch,
  KeyRound,
  Table2,
  Link2,
  CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Schema model ──────────────────────────────────────────────────────
//
// Hardcoded D1 schema catalog for the four tables exposed by d1-worker.
// Mirrors the column inventory consumed by the dashboard's table browser
// and the production data-model documented in
// `.opencode/context/project-intelligence/concepts/data-model.md`.
// Kept in sync manually — d1-worker does not yet expose a /schema
// endpoint, and the browser fetches live data via the /query route.

type SqlType = "INTEGER" | "TEXT" | "REAL" | "BOOLEAN";

/**
 * Semantic format drives the badge color so that the visual encoding is
 * consistent across the viewer. Maps to the available semantic tokens in
 * `globals.css` (text-primary, text-success, text-warning, text-accent).
 */
type ColumnFormat = "text" | "number" | "boolean" | "datetime" | "json";

type IndexKind = "PK" | "IDX" | null;

interface ForeignKeyRef {
  /** Target table id (matches TableSchema.id, not the D1 name). */
  table: string;
  /** Target column name. */
  column: string;
}

interface ColumnDef {
  name: string;
  type: SqlType;
  /** Semantic kind — used for badge color in the tabular view. */
  format: ColumnFormat;
  /** True when the column accepts NULL. */
  nullable: boolean;
  /** Default value rendered verbatim, or null when none is defined. */
  defaultValue: string | null;
  /** Primary key, secondary index, or none. */
  index: IndexKind;
  /** Optional foreign key relationship to another table in the catalog. */
  references?: ForeignKeyRef;
}

interface TableSchema {
  id: string;
  label: string;
  d1Name: string;
  description: string;
  columns: ColumnDef[];
}

const SCHEMA: readonly TableSchema[] = [
  {
    id: "positions",
    label: "Positions",
    d1Name: "positions",
    description: "Active and historical trading positions across exchanges",
    columns: [
      {
        name: "id",
        type: "INTEGER",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: "PK",
      },
      {
        name: "exchange",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "symbol",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "side",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "size",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "entry_price",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "current_price",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "pnl",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "pnl_percent",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "leverage",
        type: "INTEGER",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "status",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "opened_at",
        type: "INTEGER",
        format: "datetime",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "updated_at",
        type: "INTEGER",
        format: "datetime",
        nullable: false,
        defaultValue: null,
        index: null,
      },
    ],
  },
  {
    id: "signals",
    label: "Signals",
    d1Name: "trade_signals",
    description: "Incoming trade signals from webhooks and email parsers",
    columns: [
      {
        name: "id",
        type: "INTEGER",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: "PK",
      },
      {
        name: "source",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "type",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "symbol",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "confidence",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "received_at",
        type: "INTEGER",
        format: "datetime",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "processed",
        type: "BOOLEAN",
        format: "boolean",
        nullable: false,
        defaultValue: "0",
        index: null,
      },
    ],
  },
  {
    id: "trades",
    label: "Trades",
    d1Name: "trades",
    description: "Executed trade records linked to their originating positions",
    columns: [
      {
        name: "id",
        type: "INTEGER",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: "PK",
      },
      {
        name: "position_id",
        type: "INTEGER",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: "IDX",
        references: { table: "positions", column: "id" },
      },
      {
        name: "exchange",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "symbol",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "side",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "quantity",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "price",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "fee",
        type: "REAL",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "executed_at",
        type: "INTEGER",
        format: "datetime",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "status",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
    ],
  },
  {
    id: "agent_logs",
    label: "Agent Logs",
    d1Name: "system_logs",
    description: "Structured log entries from all workers and AI agents",
    columns: [
      {
        name: "id",
        type: "INTEGER",
        format: "number",
        nullable: false,
        defaultValue: null,
        index: "PK",
      },
      {
        name: "agent_name",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: "IDX",
      },
      {
        name: "level",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "message",
        type: "TEXT",
        format: "text",
        nullable: false,
        defaultValue: null,
        index: null,
      },
      {
        name: "context",
        type: "TEXT",
        format: "json",
        nullable: true,
        defaultValue: null,
        index: null,
      },
      {
        name: "created_at",
        type: "INTEGER",
        format: "datetime",
        nullable: false,
        defaultValue: null,
        index: null,
      },
    ],
  },
] as const;

// ── Visual encoding ───────────────────────────────────────────────────
//
// Each semantic format maps to a single semantic-token color so the
// viewer never falls back to raw palette colors.

const FORMAT_BADGE_CLASS: Record<ColumnFormat, string> = {
  text: "border-primary/30 bg-primary/10 text-primary",
  number: "border-primary/30 bg-primary/10 text-primary",
  boolean: "border-warning/30 bg-warning/10 text-warning",
  datetime: "border-success/30 bg-success/10 text-success",
  json: "border-accent/30 bg-accent/10 text-accent",
};

const NULLABLE_BADGE: Record<"YES" | "NO", string> = {
  YES: "border-success/30 bg-success/10 text-success",
  NO: "border-border bg-secondary/30 text-muted-foreground",
};

const INDEX_BADGE: Record<"PK" | "IDX" | "NONE", string> = {
  PK: "border-primary/30 bg-primary/10 text-primary",
  IDX: "border-border bg-secondary/30 text-muted-foreground",
  NONE: "text-muted-foreground",
};

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Truncate a default value for display in a narrow cell. Nulls render
 * as an em-dash to keep the row visually balanced.
 */
function formatDefaultValue(value: string | null): string {
  if (value === null) return "—";
  return value.length > 24 ? `${value.slice(0, 21)}…` : value;
}

/**
 * Inferred edges for the tree view. Derived from `column.references`
 * rather than maintained in a separate graph so the two views can never
 * drift out of sync.
 */
interface SchemaEdge {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

function buildEdges(): SchemaEdge[] {
  const edges: SchemaEdge[] = [];
  for (const table of SCHEMA) {
    for (const column of table.columns) {
      if (column.references) {
        edges.push({
          fromTable: table.id,
          fromColumn: column.name,
          toTable: column.references.table,
          toColumn: column.references.column,
        });
      }
    }
  }
  return edges;
}

// ── Sub-views ─────────────────────────────────────────────────────────

interface TabularViewProps {
  loading?: boolean;
}
function TabularView({ loading = false }: TabularViewProps) {
  const [activeTableId, setActiveTableId] = useState<string>(SCHEMA[0].id);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  return (
    <Tabs
      value={activeTableId}
      onValueChange={setActiveTableId}
      className="flex w-full flex-col gap-3"
    >
      <TabsList>
        {SCHEMA.map((table) => (
          <TabsTrigger key={table.id} value={table.id}>
            {table.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {SCHEMA.map((table) => {
        return (
          <TabsContent
            key={table.id}
            value={table.id}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                {table.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {table.description}
              </p>
              <code className="font-mono text-[10px] text-muted-foreground">
                {table.d1Name} · {table.columns.length} columns
              </code>
            </div>

            <ScrollArea className="rounded-md border border-border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs text-muted-foreground">
                      Column
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-muted-foreground">
                      Type
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-muted-foreground">
                      Nullable
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-muted-foreground">
                      Default
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-muted-foreground">
                      Index
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.columns.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-16 text-center text-sm text-muted-foreground"
                      >
                        No columns defined
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.columns.map((column) => (
                      <TableRow key={column.name}>
                        <TableCell className="whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            {column.index === "PK" ? (
                              <KeyRound className="h-3 w-3 shrink-0 text-primary" />
                            ) : null}
                            <code className="font-mono text-xs text-foreground">
                              {column.name}
                            </code>
                            {column.references ? (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Link2 className="h-2.5 w-2.5" />
                                <code className="font-mono">
                                  {column.references.table}.
                                  {column.references.column}
                                </code>
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-mono text-[10px]",
                              FORMAT_BADGE_CLASS[column.format]
                            )}
                          >
                            {column.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-mono text-[10px]",
                              column.nullable
                                ? NULLABLE_BADGE.YES
                                : NULLABLE_BADGE.NO
                            )}
                          >
                            {column.nullable ? "YES" : "NO"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <code className="font-mono text-xs text-muted-foreground">
                            {formatDefaultValue(column.defaultValue)}
                          </code>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {column.index ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-mono text-[10px]",
                                INDEX_BADGE[column.index]
                              )}
                            >
                              {column.index}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

interface TreeViewProps {
  loading?: boolean;
}

function TreeView({ loading = false }: TreeViewProps) {
  const edges = buildEdges();

  // Tables referenced as FK targets by another table in the catalog
  // become the "root" of a tree; tables with no inbound references are
  // grouped under a "Standalone" header.
  const referencedTableIds = new Set(edges.map((e) => e.toTable));
  const rootTables = SCHEMA.filter((t) => referencedTableIds.has(t.id));
  const standaloneTables = SCHEMA.filter(
    (t) =>
      !referencedTableIds.has(t.id) && !edges.some((e) => e.fromTable === t.id)
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-3/4" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-[480px]">
      <div className="flex flex-col gap-5 pr-3">
        {rootTables.length === 0 && standaloneTables.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Database />
              </EmptyMedia>
              <EmptyTitle>No tables in catalog</EmptyTitle>
              <EmptyDescription>
                Add tables to the schema catalog to see the relationship graph.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {rootTables.map((root) => {
          const incoming = edges.filter((e) => e.toTable === root.id);
          return (
            <div key={root.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <code className="font-mono text-sm font-semibold text-foreground">
                  {root.d1Name}
                </code>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {root.columns.length} cols
                </Badge>
              </div>
              <p className="pl-6 text-xs text-muted-foreground">
                {root.description}
              </p>
              <div className="flex flex-col gap-1.5 pl-6">
                {incoming.map((edge) => {
                  const child = SCHEMA.find((t) => t.id === edge.fromTable);
                  if (!child) return null;
                  return (
                    <div
                      key={`${edge.fromTable}.${edge.fromColumn}`}
                      className="flex flex-col gap-1 rounded-md border border-border/50 bg-secondary/20 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                        <code className="font-mono text-xs text-foreground">
                          {child.d1Name}
                        </code>
                        <span className="text-[10px] text-muted-foreground">
                          via
                        </span>
                        <code className="font-mono text-xs text-foreground">
                          {edge.fromColumn}
                        </code>
                        <span className="text-[10px] text-muted-foreground">
                          →
                        </span>
                        <code className="font-mono text-xs text-foreground">
                          {edge.toColumn}
                        </code>
                      </div>
                      <p className="pl-5 text-[11px] text-muted-foreground">
                        {child.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {standaloneTables.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Standalone
              </span>
            </div>
            <div className="flex flex-col gap-1.5 pl-6">
              {standaloneTables.map((table) => (
                <div
                  key={table.id}
                  className="flex flex-col gap-1 rounded-md border border-border/50 bg-secondary/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs text-foreground">
                      {table.d1Name}
                    </code>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {table.columns.length} cols
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {table.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

// ── Component ─────────────────────────────────────────────────────────

interface SchemaViewerProps {
  /**
   * When true the viewer renders skeleton placeholders in place of the
   * data. The current schema is static, but the prop keeps the
   * component ready to swap in a real `/schema` fetch.
   */
  loading?: boolean;
}

export function SchemaViewer({ loading = false }: SchemaViewerProps) {
  const [mode, setMode] = useState<"tabular" | "tree">("tabular");

  return (
    <Card className="border-border bg-card backdrop-blur-xl shadow-2xl shadow-primary/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              Schema Explorer
            </CardTitle>
            <CardDescription>
              D1 table definitions — column types, nullability, defaults and
              relationships
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
            {SCHEMA.length} tables ·{" "}
            {SCHEMA.reduce((sum, t) => sum + t.columns.length, 0)} columns
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as "tabular" | "tree")}
          className="flex w-full flex-col gap-4"
        >
          <TabsList>
            <TabsTrigger value="tabular">
              <Table2 className="h-3.5 w-3.5" />
              Tabular
            </TabsTrigger>
            <TabsTrigger value="tree">
              <GitBranch className="h-3.5 w-3.5" />
              Tree
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tabular" className="flex flex-col gap-3">
            <TabularView loading={loading} />
          </TabsContent>

          <TabsContent value="tree" className="flex flex-col gap-3">
            <TreeView loading={loading} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
