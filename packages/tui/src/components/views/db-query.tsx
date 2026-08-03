/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * DB Query View — Read-only SQL query panel for Cloudflare D1.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────────────────┐
 *   │  DB QUERY         ◉ read-only · Ctrl+Enter to run        │
 *   │───────────────────────────────────────────────────────────
 *   │  SQL> SELECT * FROM migrations ORDER BY id DESC LIMIT 5  │
 *   │  ✓ Ready · Press Enter or Ctrl+Enter to execute          │
 *   │───────────────────────────────────────────────────────────
 *   │  id   | applied_at              | name                    │
 *   │  ────────────────────────────────────────────────────────  │
 *   │  3    | 2026-01-15T10:30:00Z   | add_trades_table         │
 *   │  2    | 2026-01-10T08:00:00Z   | add_workers_index        │
 *   │  1    | 2026-01-01T00:00:00Z   | init_schema              │
 *   │───────────────────────────────────────────────────────────
 *   │  ✓ 3 rows in 12.4ms · [CLEAR] [HISTORY]                  │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Security:
 *   - Client-side pre-validation via validateReadOnlySql() before
 *     ever spawning the CLI. INSERT/UPDATE/DELETE/DROP/CREATE/ALTER
 *     and multi-statement payloads are rejected with actionable feedback.
 *   - The CLI also enforces read-only; defence in depth.
 *   - History is stored under $HOME/.hoox/.tui-state/ — no server exposure.
 *
 * Pattern established for the TUI feature-parity batch:
 *   - Pure function component, no props required
 *   - Subscribes to useUIStore (so auto-refresh can pause when not active)
 *   - Wraps content in <ErrorBoundary viewName="DB Query">
 *   - Renders an explicit empty/error state instead of throwing
 */
import { useCallback, useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { Colors, useUIStore } from "@hoox-sh/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { Spinner, EmptyState } from "../shared/spinner";
import { ViewHeader } from "../shared/view-header";
import {
  cliBridge,
  validateReadOnlySql,
  type DbQueryResult,
  type SqlValidationResult,
} from "../../services/cli-bridge";
import {
  readJsonState,
  TuiStateFiles,
  writeJsonState,
} from "../../services/tui-storage";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of history entries to persist. */
const MAX_HISTORY = 20;

/** Column width strategy: auto-computed from data. */
const COLUMN_WIDTH_STRATEGY: {
  /** Fallback width when column has no data. */
  fallback: number;
  /** Width per character category. */
  perChar: number;
  /** Minimum column width. */
  min: number;
  /** Maximum column width. */
  max: number;
} = {
  fallback: 20,
  perChar: 1,
  min: 8,
  max: 40,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format execution time for display.
 * Shows milliseconds with 1 decimal place, or "0ms" when null.
 */
function formatExecutionTime(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format a value for table cell display. Truncates long strings. */
function formatCell(value: unknown, maxWidth: number): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const str = String(value);
  if (str.length > maxWidth) return str.slice(0, maxWidth - 1) + "…";
  return str;
}

/**
 * Compute optimal column widths from column names and row data.
 * Returns a Map of column name → display width.
 */
function computeColumnWidths(
  columns: string[],
  rows: Record<string, unknown>[]
): Map<string, number> {
  const widths = new Map<string, number>();
  for (const col of columns) {
    let max = col.length;
    for (const row of rows) {
      const val = row[col];
      const display = formatCell(val, 999);
      max = Math.max(max, display.length);
    }
    const computed = Math.min(
      COLUMN_WIDTH_STRATEGY.max,
      Math.max(COLUMN_WIDTH_STRATEGY.min, max)
    );
    widths.set(col, computed);
  }
  return widths;
}

/** Derive the display label for a validation result. */
function validationLabel(v: SqlValidationResult): string {
  if (v.readonly) return "✓ Ready";
  return `✗ ${v.reason}`;
}

/** Derive the display color for a validation result. */
function validationColor(v: SqlValidationResult): string {
  return v.readonly ? Colors.success : Colors.error;
}

// ─── Sub-component: Table Header ─────────────────────────────────────────────

interface TableHeaderProps {
  columns: string[];
  widths: Map<string, number>;
  onSort: (col: string) => void;
  sortCol: string | null;
  sortDir: "asc" | "desc";
}

function TableHeader({
  columns,
  widths,
  onSort,
  sortCol,
  sortDir,
}: TableHeaderProps) {
  return (
    <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
      {columns.map((col) => {
        const w = widths.get(col) ?? COLUMN_WIDTH_STRATEGY.fallback;
        const isSortCol = col === sortCol;
        const dirMark = isSortCol ? (sortDir === "asc" ? " ↑" : " ↓") : "";
        const label = col + dirMark;
        return (
          <text
            key={col}
            fg={isSortCol ? Colors.accent : Colors.muted}
            dim={!isSortCol}
            onMouseUp={() => onSort(col)}
          >
            {label.padEnd(w)}
          </text>
        );
      })}
    </box>
  );
}

// ─── Sub-component: Table Body ────────────────────────────────────────────────

interface TableBodyProps {
  columns: string[];
  rows: Record<string, unknown>[];
  widths: Map<string, number>;
  selectedRow: number;
  onSelectRow: (idx: number) => void;
}

function TableBody({
  columns,
  rows,
  widths,
  selectedRow,
  onSelectRow,
}: TableBodyProps) {
  return (
    <scrollbox width="100%" flexGrow={1}>
      {rows.map((row, idx) => (
        <box
          key={idx}
          flexDirection="row"
          gap={1}
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={idx === selectedRow ? Colors.highlight : undefined}
          onMouseUp={() => onSelectRow(idx)}
        >
          {columns.map((col) => {
            const w = widths.get(col) ?? COLUMN_WIDTH_STRATEGY.fallback;
            const raw = row[col];
            const display = formatCell(raw, w);
            // Color NULL values distinctly
            const isNull = raw === null || raw === undefined;
            return (
              <text
                key={col}
                fg={isNull ? Colors.muted : Colors.foreground}
                dim={isNull}
              >
                {display.padEnd(w)}
              </text>
            );
          })}
        </box>
      ))}
    </scrollbox>
  );
}

// ─── Sub-component: History Overlay ──────────────────────────────────────────

interface HistoryOverlayProps {
  history: string[];
  onSelect: (sql: string) => void;
  onClose: () => void;
}

function HistoryOverlay({ history, onSelect, onClose }: HistoryOverlayProps) {
  // Keyboard: Escape closes, Up/Down navigate, Enter selects
  useKeyboard((key) => {
    if (key.name === "escape") {
      onClose();
      return;
    }
  });

  if (history.length === 0) {
    return (
      <box
        flexDirection="column"
        flexGrow={1}
        padding={2}
        border={true}
        borderStyle="single"
        borderColor={Colors.border}
        backgroundColor={Colors.card}
      >
        <text fg={Colors.muted} dim>
          No query history yet.
        </text>
        <text fg={Colors.muted} dim>
          Press Escape to close.
        </text>
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border={true}
      borderStyle="single"
      borderColor={Colors.border}
      backgroundColor={Colors.card}
      paddingX={1}
      paddingY={0}
    >
      <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
        <text fg={Colors.accent} bold>
          QUERY HISTORY
        </text>
        <text fg={Colors.muted} dim>
          ({history.length} · Esc to close)
        </text>
      </box>
      <text fg={Colors.border} dim>
        {"─".repeat(60)}
      </text>
      <scrollbox width="100%" flexGrow={1}>
        {[...history].reverse().map((sql, revIdx) => {
          const idx = history.length - 1 - revIdx;
          return (
            <box
              key={idx}
              flexDirection="column"
              paddingLeft={1}
              paddingRight={1}
              gap={0}
              onMouseUp={() => {
                onSelect(sql);
                onClose();
              }}
            >
              <text fg={Colors.muted} dim>
                [{idx + 1}]
              </text>
              <text fg={Colors.foreground}>
                {sql.length > 70 ? sql.slice(0, 67) + "…" : sql}
              </text>
            </box>
          );
        })}
      </scrollbox>
    </box>
  );
}

// ─── Sub-component: SQL Input Row ─────────────────────────────────────────────

interface SqlInputRowProps {
  sql: string;
  validation: SqlValidationResult | null;
  inputActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onChange: (next: string) => void;
}

function SqlInputRow({
  sql,
  validation,
  inputActive,
  onActivate,
  onDeactivate,
  onChange,
}: SqlInputRowProps) {
  // Capture keyboard when active.
  useKeyboard((key) => {
    if (!inputActive) return;
    if (key.name === "escape") {
      onDeactivate();
      return;
    }
    if (key.name === "backspace") {
      onChange(sql.slice(0, -1));
      return;
    }
    if (key.name === "return") return; // Handled at the view level
    // Character input: only printable ASCII + basic Unicode word chars
    if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
      onChange(sql + key.sequence);
    }
  });

  const label = validation ? validationLabel(validation) : "Type a query…";
  const color = validation ? validationColor(validation) : Colors.muted;

  // Cursor: show "_" blink when active
  const displaySql =
    sql.length > 0 ? sql : inputActive ? "" : "(press Enter to execute)";
  const cursor = inputActive ? "_" : "";

  return (
    <box
      flexDirection="column"
      gap={0}
      border={true}
      borderStyle="single"
      borderColor={inputActive ? Colors.accent : Colors.border}
      onMouseUp={onActivate}
    >
      {/* SQL prompt line */}
      <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
        <text fg={Colors.muted}>SQL&gt;</text>
        <text fg={Colors.foreground}>
          {displaySql}
          {cursor}
        </text>
      </box>
      {/* Validation feedback */}
      <box paddingLeft={1} paddingRight={1}>
        <text fg={color} dim={!inputActive}>
          {label} · Enter to run · ↑↓ history
        </text>
      </box>
    </box>
  );
}

// ─── Main DbQuery View ────────────────────────────────────────────────────────

/**
 * DbQuery — Main view for read-only D1 SQL queries.
 *
 * Pattern for the TUI feature-parity batch:
 *   1. Pure function component, no required props
 *   2. Subscribes to `useUIStore.activeView` to pause auto-refresh
 *      when the user navigates away
 *   3. Uses `cliBridge.dbQuery(sql)` for execution
 *   4. Wraps in <ErrorBoundary viewName="DB Query"> so a render bug
 *      in this view never crashes the whole TUI
 *   5. Renders an explicit empty/error state instead of throwing
 *
 * Keyboard shortcuts (when this view is active):
 *   - Enter / Ctrl+Enter  → execute query (when SQL is non-empty)
 *   - ↑                  → previous history entry
 *   - ↓                  → next history entry
 *   - Ctrl+H             → open history overlay
 *   - Escape             → deactivate SQL input / close history
 */
export function DbQueryView() {
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "db-query";

  // ── SQL input state ────────────────────────────────────────────────────────
  const [sql, setSql] = useState("");
  const [validation, setValidation] = useState<SqlValidationResult | null>(
    null
  );
  const [inputActive, setInputActive] = useState(false);

  // ── Query result state ─────────────────────────────────────────────────────
  const [result, setResult] = useState<DbQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  // ── History state ──────────────────────────────────────────────────────────
  const [history, setHistory] = useState<string[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);

  // ── Table navigation ───────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedRow, setSelectedRow] = useState(0);

  // Load query history from disk on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readJsonState<string[]>(
        TuiStateFiles.dbQueryHistory,
        []
      );
      if (cancelled) return;
      if (Array.isArray(stored)) {
        setHistory(stored.slice(0, MAX_HISTORY));
      }
      setHistoryReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist history to disk whenever it changes (after initial load).
  useEffect(() => {
    if (!historyReady) return;
    void writeJsonState(TuiStateFiles.dbQueryHistory, history);
  }, [history, historyReady]);

  // ── Execute query ──────────────────────────────────────────────────────────
  const executeQuery = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;

    // Client-side pre-validation (defence in depth).
    const v = validateReadOnlySql(trimmed);
    setValidation(v);
    if (!v.readonly) {
      setQueryError(null);
      return;
    }

    setLoading(true);
    setQueryError(null);
    const res = await cliBridge.dbQuery(trimmed);
    if (res.success && res.data) {
      setResult(res.data);
      setQueryError(null);
      // Append to history (dedupe: remove if already present).
      setHistory((prev) => {
        const without = prev.filter((h) => h !== trimmed);
        return [trimmed, ...without].slice(0, MAX_HISTORY);
      });
      setHistoryIdx(-1);
      setSelectedRow(0);
      setSortCol(null);
    } else {
      setResult(null);
      setQueryError(res.stderr || res.stdout || "Query failed");
    }
    setLoading(false);
  }, []);

  // ── Validation feedback as user types ─────────────────────────────────────
  useEffect(() => {
    if (sql.trim().length === 0) {
      setValidation(null);
      return;
    }
    const v = validateReadOnlySql(sql.trim());
    setValidation(v);
  }, [sql]);

  // ── SQL input activation ───────────────────────────────────────────────────
  const handleActivateInput = useCallback(() => {
    setInputActive(true);
  }, []);

  const handleDeactivateInput = useCallback(() => {
    setInputActive(false);
  }, []);

  // ── Sort handler ────────────────────────────────────────────────────────────
  const handleSort = useCallback((col: string) => {
    setSortCol((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return col;
      }
      setSortDir("asc");
      return col;
    });
  }, []);

  // ── History navigation ─────────────────────────────────────────────────────
  const handleHistoryUp = useCallback(() => {
    if (history.length === 0) return;
    const next = Math.min(historyIdx + 1, history.length - 1);
    setHistoryIdx(next);
    setSql(history[next] ?? "");
    setValidation(null); // Reset validation until user edits
  }, [history, historyIdx]);

  const handleHistoryDown = useCallback(() => {
    if (historyIdx <= 0) {
      setHistoryIdx(-1);
      setSql("");
      return;
    }
    const next = historyIdx - 1;
    setHistoryIdx(next);
    setSql(history[next] ?? "");
  }, [historyIdx, history]);

  // ── Global keyboard shortcuts (active view only) ───────────────────────────
  useKeyboard((key) => {
    if (!isActive) return;
    if (showHistory) return; // History overlay handles its own keys

    // Ctrl+H: toggle history
    if (key.ctrl && key.name === "h") {
      setShowHistory((v) => !v);
      return;
    }

    // If input is not active, activate it on any printable character
    // or when Enter is pressed.
    if (!inputActive) {
      if (key.name === "return") {
        if (sql.trim().length > 0) {
          void executeQuery(sql);
        }
        return;
      }
      if (key.name === "up") {
        void handleHistoryUp();
        return;
      }
      if (key.name === "down") {
        void handleHistoryDown();
        return;
      }
      // Any printable character activates input
      if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
        setInputActive(true);
        setSql(sql + key.sequence);
        return;
      }
      return;
    }

    // Input is active
    if (key.name === "return") {
      if (key.ctrl || sql.includes("\n")) {
        // Ctrl+Enter or multiline: execute
        void executeQuery(sql);
        setInputActive(false);
      } else {
        // Plain Enter: execute and keep input active for chaining
        void executeQuery(sql);
      }
      return;
    }

    if (key.name === "up") {
      void handleHistoryUp();
      return;
    }
    if (key.name === "down") {
      void handleHistoryDown();
      return;
    }
  });

  // ── Derived data ────────────────────────────────────────────────────────────
  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];

  // Client-side sort if a sort column is selected.
  const sortedRows =
    sortCol && rows.length > 0
      ? [...rows].sort((a, b) => {
          const av = a[sortCol];
          const bv = b[sortCol];
          const cmp =
            typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av).localeCompare(String(bv));
          return sortDir === "asc" ? cmp : -cmp;
        })
      : rows;

  // Compute column widths from data.
  const columnWidths = computeColumnWidths(columns, sortedRows);

  // Total table width (for separator lines).
  const totalWidth = columns.reduce(
    (acc, col) =>
      acc + (columnWidths.get(col) ?? COLUMN_WIDTH_STRATEGY.fallback) + 1,
    0
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary viewName="DB Query">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        <ViewHeader
          title="DB QUERY"
          showDivider={false}
          meta={
            <box flexDirection="row" gap={2} alignItems="center">
              {result ? (
                <text fg={Colors.muted} dim>
                  {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
                </text>
              ) : null}
              <text fg={Colors.success} dim>
                ◉ read-only
              </text>
            </box>
          }
        />

        {/* SQL input row */}
        <SqlInputRow
          sql={sql}
          validation={validation}
          inputActive={inputActive}
          onActivate={handleActivateInput}
          onDeactivate={handleDeactivateInput}
          onChange={setSql}
        />

        {/* Main content area: results table or history */}
        <box
          flexGrow={1}
          border={true}
          borderStyle="single"
          borderColor={Colors.border}
          flexDirection="column"
          paddingX={1}
          paddingY={0}
        >
          {showHistory ? (
            <HistoryOverlay
              history={history}
              onSelect={(selected) => {
                setSql(selected);
                setValidation(null);
                setInputActive(false);
                setShowHistory(false);
              }}
              onClose={() => setShowHistory(false)}
            />
          ) : loading ? (
            <box
              padding={1}
              alignItems="center"
              justifyContent="center"
              flexGrow={1}
            >
              <Spinner label="Executing query..." />
            </box>
          ) : queryError && rows.length === 0 ? (
            <box padding={1} flexDirection="column" gap={0}>
              <text fg={Colors.error} bold>
                !{" "}
                {queryError.length > 70
                  ? queryError.slice(0, 67) + "…"
                  : queryError}
              </text>
              <text fg={Colors.muted} dim>
                Make sure wrangler is installed and authenticated.
              </text>
            </box>
          ) : !result ? (
            <box padding={1} flexGrow={1}>
              <EmptyState
                message="Enter a SELECT query above and press Enter to execute."
                suggestion="Example: SELECT name, sql FROM sqlite_master WHERE type='table'"
                icon="🔍"
              />
            </box>
          ) : rows.length === 0 ? (
            <box padding={1} flexGrow={1}>
              <EmptyState message="Query returned 0 rows." icon="∅" />
            </box>
          ) : (
            <>
              {/* Column headers */}
              <TableHeader
                columns={columns}
                widths={columnWidths}
                onSort={handleSort}
                sortCol={sortCol}
                sortDir={sortDir}
              />
              {/* Divider */}
              <text fg={Colors.border} dim>
                {"─".repeat(Math.min(totalWidth, 120))}
              </text>
              {/* Data rows */}
              <TableBody
                columns={columns}
                rows={sortedRows}
                widths={columnWidths}
                selectedRow={selectedRow}
                onSelectRow={setSelectedRow}
              />
            </>
          )}
        </box>

        {/* Footer */}
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <box flexDirection="row" gap={2} alignItems="center">
            {result ? (
              <>
                <text fg={Colors.success} dim>
                  ✓ {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
                </text>
                <text fg={Colors.muted} dim>
                  in {formatExecutionTime(result.executionTimeMs)}
                </text>
              </>
            ) : queryError && rows.length > 0 ? (
              <text fg={Colors.warning} dim>
                !{" "}
                {queryError.length > 50
                  ? queryError.slice(0, 47) + "…"
                  : queryError}
              </text>
            ) : null}
          </box>
          <box flexDirection="row" gap={1} alignItems="center">
            <text
              fg={Colors.muted}
              bg={Colors.card}
              onMouseUp={() => {
                setResult(null);
                setSql("");
                setValidation(null);
                setQueryError(null);
              }}
            >
              {" [CLEAR] "}
            </text>
            <text
              fg={showHistory ? Colors.accent : Colors.muted}
              bg={Colors.card}
              onMouseUp={() => setShowHistory((v) => !v)}
            >
              {" [HISTORY] "}
            </text>
          </box>
        </box>
      </box>
    </ErrorBoundary>
  );
}
