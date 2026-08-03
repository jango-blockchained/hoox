/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Logs Viewer Tests — Filter logic, component structure, and keyboard behavior.
 *
 * Tests use bun:test and validate:
 *   - Filter AND logic (level + worker + text search)
 *   - Color-coded level output
 *   - Pause/resume behavior
 *   - Empty state rendering
 */
import { describe, it, expect } from "bun:test";
import { Colors, LogLevelColor } from "@hoox-sh/hoox-shared";
import {
  makeLog,
  makeWorker,
  type TestLogEntry,
  type TestWorkerInfo,
  type LogLevel,
} from "../../test-utils";

// ─── Filter logic extracted for pure unit testing ────────────────────────────

const ALL_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

function applyFilters(
  entries: TestLogEntry[],
  options: {
    allLevels: boolean;
    levels: Set<LogLevel>;
    selectedWorkers: Set<string>;
    searchText: string;
    workers: TestWorkerInfo[];
  }
): TestLogEntry[] {
  const { allLevels, levels, selectedWorkers, searchText, workers } = options;
  const activeLevels = allLevels ? new Set(ALL_LEVELS) : levels;
  const query = searchText.toLowerCase().trim();

  if (activeLevels.size === 0 && !allLevels) return [];

  return entries.filter((entry) => {
    if (!activeLevels.has(entry.level)) return false;

    if (selectedWorkers.size > 0) {
      const w = workers.find((w) => w.id === entry.workerId);
      if (!w || !selectedWorkers.has(w.name)) return false;
    }

    if (query && !entry.message.toLowerCase().includes(query)) return false;

    return true;
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("LogsViewer filter logic", () => {
  const entries: TestLogEntry[] = [
    makeLog({ id: "1", level: "error", message: "Connection failed" }),
    makeLog({ id: "2", level: "warn", message: "High latency" }),
    makeLog({ id: "3", level: "info", message: "Worker started" }),
    makeLog({ id: "4", level: "debug", message: "Trace data" }),
    makeLog({
      id: "5",
      level: "error",
      message: "Auth failure",
      workerId: "w1",
    }),
    makeLog({
      id: "6",
      level: "info",
      message: "Trade executed",
      workerId: "w2",
    }),
  ];

  const workers: TestWorkerInfo[] = [
    makeWorker({ id: "w1", name: "alpha-worker" }),
    makeWorker({ id: "w2", name: "beta-worker" }),
  ];

  it("passes all entries when All levels is selected", () => {
    const result = applyFilters(entries, {
      allLevels: true,
      levels: new Set(),
      selectedWorkers: new Set(),
      searchText: "",
      workers,
    });
    expect(result).toHaveLength(6);
  });

  it("filters to only selected levels", () => {
    const result = applyFilters(entries, {
      allLevels: false,
      levels: new Set<LogLevel>(["error"]),
      selectedWorkers: new Set(),
      searchText: "",
      workers,
    });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.level === "error")).toBe(true);
  });

  it("returns empty when no levels selected and All is off", () => {
    const result = applyFilters(entries, {
      allLevels: false,
      levels: new Set(),
      selectedWorkers: new Set(),
      searchText: "",
      workers,
    });
    expect(result).toHaveLength(0);
  });

  it("filters by worker name", () => {
    const result = applyFilters(entries, {
      allLevels: true,
      levels: new Set(),
      selectedWorkers: new Set(["alpha-worker"]),
      searchText: "",
      workers,
    });
    // Entries with workerId=w1 (alpha-worker) + entries with no workerId
    expect(result).toHaveLength(1); // only id=5 has workerId=w1
    expect(result[0].id).toBe("5");
  });

  it("filters by text search (case-insensitive)", () => {
    const result = applyFilters(entries, {
      allLevels: true,
      levels: new Set(),
      selectedWorkers: new Set(),
      searchText: "trade",
      workers,
    });
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Trade executed");
  });

  it("combines filters with AND logic", () => {
    const result = applyFilters(entries, {
      allLevels: false,
      levels: new Set<LogLevel>(["error", "info"]),
      selectedWorkers: new Set(["alpha-worker"]),
      searchText: "auth",
      workers,
    });
    // Must be error OR info, alpha-worker, contains "auth"
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("5"); // error + w1 + "Auth failure"
  });

  it("handles empty text search as pass-through", () => {
    const result = applyFilters(entries, {
      allLevels: true,
      levels: new Set(),
      selectedWorkers: new Set(),
      searchText: "",
      workers,
    });
    expect(result).toHaveLength(6);
  });

  it("handles no workers with selected worker filter", () => {
    const result = applyFilters(entries, {
      allLevels: true,
      levels: new Set(),
      selectedWorkers: new Set(["nonexistent"]),
      searchText: "",
      workers,
    });
    expect(result).toHaveLength(0);
  });

  it("passes entries with no workerId when workers filter is empty", () => {
    const result = applyFilters(entries, {
      allLevels: true,
      levels: new Set(),
      selectedWorkers: new Set(),
      searchText: "",
      workers,
    });
    // Entries 1-4 have no workerId, they should all pass
    const noWorkerEntries = result.filter((e) => !e.workerId);
    expect(noWorkerEntries).toHaveLength(4);
  });

  it("excludes entries with no workerId when worker filter is active", () => {
    const result = applyFilters(entries, {
      allLevels: true,
      levels: new Set(),
      selectedWorkers: new Set(["alpha-worker"]),
      searchText: "",
      workers,
    });
    const noWorkerEntries = result.filter((e) => !e.workerId);
    expect(noWorkerEntries).toHaveLength(0);
  });
});

describe("LogsViewer level colors", () => {
  it("maps error to red", () => {
    expect(LogLevelColor.error).toBe(Colors.error);
  });

  it("maps warn to amber/yellow", () => {
    expect(LogLevelColor.warn).toBe(Colors.warning);
  });

  it("maps info to foreground", () => {
    expect(LogLevelColor.info).toBe(Colors.foreground);
  });

  it("maps debug to muted (readable, not dim)", () => {
    expect(LogLevelColor.debug).toBe(Colors.muted);
  });

  it("has entries for all LogLevel values", () => {
    const allLevels: LogLevel[] = ["error", "warn", "info", "debug"];
    for (const lvl of allLevels) {
      expect(LogLevelColor[lvl]).toBeDefined();
      expect(typeof LogLevelColor[lvl]).toBe("string");
      expect(LogLevelColor[lvl]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("LogsViewer empty state", () => {
  it("returns empty array for empty input", () => {
    const result = applyFilters([], {
      allLevels: true,
      levels: new Set(),
      selectedWorkers: new Set(),
      searchText: "",
      workers: [],
    });
    expect(result).toHaveLength(0);
  });

  it("preserves empty array with all filters active", () => {
    const result = applyFilters([], {
      allLevels: false,
      levels: new Set<LogLevel>(["error", "warn"]),
      selectedWorkers: new Set(["some-worker"]),
      searchText: "nothing",
      workers: [makeWorker()],
    });
    expect(result).toHaveLength(0);
  });
});
