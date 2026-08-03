/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Logs Viewer — Split-layout view with filter controls on left (20 cols) and
 * scrolling color-coded log stream on right. Filters combine with AND logic.
 * Keyboard: Space toggles pause, / focuses the search field.
 *
 * Uses service store logs (ring buffer) and workers list for filter checkboxes.
 * Color-coded by level using Hoox design tokens. Wrapped in ErrorBoundary.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import {
  Colors,
  LogLevelColor,
  useServiceStore,
  useUIStore,
} from "@hoox-sh/hoox-shared";
import type { LogEntry, LogLevel, Alert } from "@hoox-sh/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { cliBridge } from "../../services/cli-bridge";
import { ViewHeader } from "../shared/view-header";
import { Panel } from "../shared/panel";

// ─── Color Tokens ────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<LogLevel, string> = {
  error: "ERR",
  warn: "WRN",
  info: "INF",
  debug: "DBG",
};

const ALL_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function truncateRight(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}

// ─── Filter Panel ────────────────────────────────────────────────────────────

interface FilterPanelProps {
  allLevels: boolean;
  onToggleAll: () => void;
  levels: Set<LogLevel>;
  onToggleLevel: (l: LogLevel) => void;
  workerNames: string[];
  selectedWorkers: Set<string>;
  onToggleWorker: (name: string) => void;
  searchText: string;
  onSearchChange: (v: string) => void;
}

function FilterPanel({
  allLevels,
  onToggleAll,
  levels,
  onToggleLevel,
  workerNames,
  selectedWorkers,
  onToggleWorker,
  searchText,
  onSearchChange,
}: FilterPanelProps) {
  return (
    <Panel title="FILTERS" width={20} elevated={false}>
      {/* ── Level Section ───────────────────────────────────────────────── */}
      <text bold fg={Colors.muted}>
        LEVEL
      </text>
      <box flexDirection="row" gap={1}>
        <text
          fg={allLevels ? Colors.accent : Colors.muted}
          onMouseUp={onToggleAll}
        >
          {allLevels ? "[x]" : "[ ]"} ALL
        </text>
      </box>
      {ALL_LEVELS.map((lvl) => (
        <box flexDirection="row" gap={1} key={lvl}>
          <text
            fg={levels.has(lvl) ? Colors.accent : Colors.muted}
            onMouseUp={() => onToggleLevel(lvl)}
          >
            {levels.has(lvl) ? "[x]" : "[ ]"}
          </text>
          <text fg={LogLevelColor[lvl]} dim={lvl === "debug"}>
            {LEVEL_LABEL[lvl]}
          </text>
        </box>
      ))}

      {/* ── Worker Section ──────────────────────────────────────────────── */}
      <box height={1} />
      <text bold fg={Colors.muted}>
        WORKER
      </text>
      {workerNames.length === 0 ? (
        <text dim fg={Colors.dim}>
          (no workers)
        </text>
      ) : (
        <scrollbox height={6} border={false}>
          {workerNames.map((name) => (
            <box flexDirection="row" gap={1} key={name}>
              <text
                fg={selectedWorkers.has(name) ? Colors.accent : Colors.muted}
                onMouseUp={() => onToggleWorker(name)}
              >
                {selectedWorkers.has(name) ? "[x]" : "[ ]"}
              </text>
              <text fg={Colors.foreground}>{truncateRight(name, 14)}</text>
            </box>
          ))}
        </scrollbox>
      )}

      {/* ── Search Section ──────────────────────────────────────────────── */}
      <box height={1} />
      <text bold fg={Colors.muted}>
        SEARCH /
      </text>
      <input
        id="log-search"
        placeholder="Filter text..."
        width={18}
        textColor={Colors.foreground}
        cursorColor={Colors.accent}
        onInput={(v: string) => onSearchChange(v)}
        value={searchText}
      />
    </Panel>
  );
}

// ─── Log Stream ──────────────────────────────────────────────────────────────

interface LogStreamProps {
  entries: LogEntry[];
  paused: boolean;
}

function LogStream({ entries, paused }: LogStreamProps) {
  if (entries.length === 0) {
    return (
      <Panel title="LOG STREAM" flexGrow={1} elevated={false}>
        <box
          flexGrow={1}
          justifyContent="center"
          alignItems="center"
          flexDirection="column"
        >
          <text dim fg={Colors.muted}>
            {paused
              ? "Paused — press Space to resume"
              : "No matching log entries"}
          </text>
        </box>
      </Panel>
    );
  }

  return (
    <scrollbox flexGrow={1} border={false}>
      {entries.map((entry) => {
        const fg = LogLevelColor[entry.level];
        const dim = entry.level === "debug";
        const label = LEVEL_LABEL[entry.level];
        const time = formatTimestamp(entry.timestamp);
        const src = entry.source ? ` [${truncateRight(entry.source, 12)}]` : "";
        const workerTag = entry.workerId
          ? ` (${truncateRight(entry.workerId, 10)})`
          : "";

        return (
          <box flexDirection="row" gap={1} key={entry.id}>
            <text dim fg={Colors.muted} selectable>
              {time}
            </text>
            <text fg={fg} bold={entry.level === "error"} dim={dim} selectable>
              {label}
            </text>
            <text dim fg={Colors.muted} selectable>
              {src}
              {workerTag}
            </text>
            <text fg={dim ? Colors.dim : fg} selectable>
              {entry.message}
            </text>
          </box>
        );
      })}
    </scrollbox>
  );
}

// ─── Action Bar ──────────────────────────────────────────────────────────────

interface ActionBarProps {
  paused: boolean;
  onTogglePause: () => void;
  onExport: () => void;
  onClear: () => void;
  sseConnected: boolean;
  onFetch?: () => void;
}

function ActionBar({
  paused,
  onTogglePause,
  onExport,
  onClear,
  sseConnected,
  onFetch,
}: ActionBarProps) {
  return (
    <box
      flexDirection="row"
      height={1}
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      border={true}
      borderStyle="single"
    >
      <box flexDirection="row" gap={2}>
        <text
          fg={paused ? Colors.accent : Colors.foreground}
          onMouseUp={onTogglePause}
        >
          [{paused ? "\u25B6 Resume" : "\u275A\u275A Pause"}]
        </text>
        <text fg={Colors.foreground} onMouseUp={onExport}>
          [Export]
        </text>
        <text fg={Colors.foreground} onMouseUp={onClear}>
          [Clear]
        </text>
        {!sseConnected && onFetch ? (
          <text fg={Colors.accent} onMouseUp={onFetch}>
            [FETCH]
          </text>
        ) : null}
      </box>
      <text dim fg={Colors.muted}>
        Space:pause /:search Tab:switch
      </text>
    </box>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────

export function LogsViewer() {
  // ── Local state ─────────────────────────────────────────────────────────
  const [paused, setPaused] = useState(false);
  const [allLevels, setAllLevels] = useState(true);
  const [levels, setLevels] = useState<Set<LogLevel>>(new Set());
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(
    new Set()
  );
  const [searchText, setSearchText] = useState("");
  /** When true, printable keys append to searchText instead of being ignored. */
  const [searchActive, setSearchActive] = useState(false);

  // ── Store subscriptions (selectors only) ────────────────────────────────
  const allLogs = useServiceStore((s) => s.logs);
  const workers = useServiceStore((s) => s.workers);
  const connectionStatus = useServiceStore((s) => s.connectionStatus);
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "logs-viewer";

  // Derive unique worker names for checkboxes
  const workerNames = useMemo(() => workers.map((w) => w.name), [workers]);

  // ── Toggle helpers ──────────────────────────────────────────────────────
  const toggleAll = useCallback(() => {
    setAllLevels((prev) => !prev);
  }, []);

  const toggleLevel = useCallback((lvl: LogLevel) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  }, []);

  const toggleWorker = useCallback((name: string) => {
    setSelectedWorkers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleExport = useCallback(async () => {
    const ts = Date.now();
    try {
      const result = await cliBridge.exec<LogEntry[]>(["logs", "all"], {
        json: true,
        timeout: 20_000,
      });

      let data: LogEntry[];
      if (result.success && result.data) {
        data = result.data;
      } else {
        data = useServiceStore.getState().logs;
      }

      const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
      const dirPath = `${homeDir}/.hoox`;
      const filePath = `${dirPath}/logs-export-${ts}.json`;
      await Bun.write(filePath, JSON.stringify(data, null, 2));

      const alert: Alert = {
        id: `export-${ts}`,
        type: "info",
        severity: "info",
        message: `Exported ${data.length} logs to ${filePath}`,
        timestamp: ts,
        acknowledged: false,
      };
      useServiceStore.getState().addAlert(alert);
    } catch (err) {
      const alert: Alert = {
        id: `export-err-${Date.now()}`,
        type: "error",
        severity: "error",
        message: `Export failed: ${(err as Error).message}`,
        timestamp: Date.now(),
        acknowledged: false,
      };
      useServiceStore.getState().addAlert(alert);
    }
  }, []);

  const handleClear = useCallback(() => {
    // Soft confirm via status alert path — clearing is local buffer only.
    // (No dialog prop on this view; keep non-destructive.)
    const ts = Date.now();
    useServiceStore.setState((state) => {
      state.logs = [];
    });
    const alert: Alert = {
      id: `clear-${ts}`,
      type: "info",
      severity: "info",
      message: "Log buffer cleared",
      timestamp: ts,
      acknowledged: false,
    };
    useServiceStore.getState().addAlert(alert);
  }, []);

  const handleFetch = useCallback(async () => {
    const ts = Date.now();
    let fetchedCount = 0;
    const names = useServiceStore.getState().workers.map((w) => w.name);
    if (names.length === 0) {
      names.push("all");
    }
    for (const name of names) {
      try {
        const result = await cliBridge.workerLogs(name);
        if (result.success && Array.isArray(result.data)) {
          const entries = result.data as LogEntry[];
          for (const entry of entries) {
            useServiceStore.getState().pushLog(entry);
          }
          fetchedCount += entries.length;
        }
      } catch {
        // skip failed worker
      }
    }
    const alert: Alert = {
      id: `fetch-${ts}`,
      type: "info",
      severity: "info",
      message:
        fetchedCount > 0
          ? `Fetched ${fetchedCount} logs from CLI`
          : "No logs fetched from CLI",
      timestamp: ts,
      acknowledged: false,
    };
    useServiceStore.getState().addAlert(alert);
  }, []);

  // ── Filter logic (AND combination) ──────────────────────────────────────
  const filteredLogs = useMemo(() => {
    const activeLevels = allLevels ? new Set(ALL_LEVELS) : levels;
    const query = searchText.toLowerCase().trim();

    if (activeLevels.size === 0 && !allLevels) return [];

    return allLogs.filter((entry) => {
      // Level filter
      if (!activeLevels.has(entry.level)) return false;

      // Worker filter (empty set = pass all)
      if (selectedWorkers.size > 0) {
        const w = workers.find((w) => w.id === entry.workerId);
        if (!w || !selectedWorkers.has(w.name)) return false;
      }

      // Text search filter (case-insensitive substring)
      if (query && !entry.message.toLowerCase().includes(query)) return false;

      return true;
    });
  }, [allLogs, allLevels, levels, selectedWorkers, searchText, workers]);

  // Display newest-first so fresh entries appear at top in ScrollBox
  const displayed = useMemo(() => [...filteredLogs].reverse(), [filteredLogs]);

  // ── Paused buffer ───────────────────────────────────────────────────────
  const [frozen, setFrozen] = useState<LogEntry[] | null>(null);
  const visible = paused && frozen !== null ? frozen : displayed;

  // Capture snapshot when pausing, clear when resuming
  useEffect(() => {
    if (paused && frozen === null) {
      setFrozen(displayed);
    }
    if (!paused && frozen !== null) {
      setFrozen(null);
    }
  }, [paused, frozen, displayed]);

  // ── Keyboard (active view only) ─────────────────────────────────────────
  useKeyboard((key: { name: string; sequence?: string; ctrl?: boolean }) => {
    if (!isActive) return;

    // Search mode: type to filter, Esc / Enter to leave
    if (searchActive) {
      if (key.name === "escape" || key.name === "return") {
        setSearchActive(false);
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        setSearchText((t) => t.slice(0, -1));
        return;
      }
      if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
        setSearchText((t) => t + key.sequence);
      }
      return;
    }

    if (key.name === "space") {
      setPaused((p) => !p);
      return;
    }
    if (key.name === "slash" || key.name === "/") {
      setSearchActive(true);
      return;
    }
  });

  return (
    <ErrorBoundary viewName="Logs Viewer">
      <box flexDirection="column" flexGrow={1} padding={0} gap={1}>
        {/* ── Title bar ────────────────────────────────────────────────────── */}
        <ViewHeader
          title="LOGS VIEWER"
          showDivider={false}
          meta={
            <text dim fg={Colors.muted}>
              {filteredLogs.length}/{allLogs.length} entries
              {paused ? " [PAUSED]" : ""}
              {searchActive ? " [SEARCH]" : ""}
              {" · Space pause · / search"}
            </text>
          }
        />

        {/* ── Split: Filters | Stream ──────────────────────────────────────── */}
        <box flexDirection="row" flexGrow={1} gap={1}>
          <FilterPanel
            allLevels={allLevels}
            onToggleAll={toggleAll}
            levels={levels}
            onToggleLevel={toggleLevel}
            workerNames={workerNames}
            selectedWorkers={selectedWorkers}
            onToggleWorker={toggleWorker}
            searchText={searchText}
            onSearchChange={setSearchText}
          />
          <LogStream entries={visible} paused={paused} />
        </box>

        {/* ── Action Bar footer ────────────────────────────────────────────── */}
        <ActionBar
          paused={paused}
          onTogglePause={() => setPaused((p) => !p)}
          onExport={handleExport}
          onClear={handleClear}
          sseConnected={connectionStatus === "connected"}
          onFetch={handleFetch}
        />
      </box>
    </ErrorBoundary>
  );
}
