/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified per-suite test summary table.
 *
 * Renders a JUnit XML test report (as emitted by Bun's `--reporter=junit`
 * configured in `bunfig.toml`) as a single ASCII table with one row per
 * test suite plus a Total row. Columns: Suite │ Passed │ Failed │ Skipped
 * │ Duration.
 *
 * Pure function — no I/O, no side effects. Callers read the XML file
 * (synchronously in `process.on('exit')` is supported) and print the
 * returned string.
 *
 * Design notes:
 *   - No external dependencies. ANSI escape codes are inlined so the
 *     renderer has no `ansis` (or other styling) runtime requirement.
 *   - JUnit XML is parsed with a small regex (no DOMParser dependency)
 *     because Bun does not ship a JUnit DOMParser and the format is
 *     regular enough that a regex is both faster and more portable.
 *   - Output is colored when stdout is a TTY; plain text otherwise. The
 *     caller is responsible for TTY detection (we just always emit the
 *     codes — terminals ignore them in non-TTY contexts).
 */

/* ─── ANSI primitives ─────────────────────────────────────────────── */

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const CYAN = `${ESC}36m`;
const GREEN = `${ESC}32m`;
const RED = `${ESC}31m`;
const YELLOW = `${ESC}33m`;

// eslint-disable-next-line no-control-regex -- \x1b is the intentional ESC byte that opens every ANSI SGR sequence
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

/* ─── Public types ────────────────────────────────────────────────── */

export interface SuiteRow {
  /** Test suite name (usually the file path relative to the run root). */
  name: string;
  /** Total number of tests in the suite. */
  total: number;
  /** Assertion failures (test ran, assertion failed). */
  failures: number;
  /** Uncaught errors / exceptions. */
  errors: number;
  /** Tests explicitly skipped (`.skip`, `describe.skip`, etc.). */
  skipped: number;
  /** Total suite duration in seconds. */
  time: number;
}

export interface RenderOptions {
  /** Show a Total row at the bottom. Default: true. */
  showTotal?: boolean;
  /** Truncate suite names longer than this many visible chars. Default: 50. */
  maxNameLen?: number;
}

interface CellRow {
  name: string;
  passed: string;
  failed: string;
  skipped: string;
  duration: string;
}

const DEFAULT_OPTS: Required<RenderOptions> = {
  showTotal: true,
  maxNameLen: 50,
};

/* ─── XML parsing ─────────────────────────────────────────────────── */

/**
 * Aggregate totals from the root `<testsuites>` tag.
 *
 * Bun's JUnit reporter emits a single aggregate at the document root
 * with the canonical run totals (`tests`, `failures`, `errors`,
 * `skipped`, `time`). When individual `<testsuite>` elements nest —
 * which Bun does for nested `describe` blocks — the per-suite
 * `failures` counts add up to more than the unique failing-test count
 * because the same failure is reported at every nesting level. The
 * root aggregate is the only place to read the de-duplicated total.
 */
export interface AggregateStats {
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  time: number;
}

const ATTR_RE = /(\w+)="([^"]*)"/g;

/** Extract the root `<testsuites>` aggregate stats, if present. */
export function parseRootAggregate(xml: string): AggregateStats | null {
  if (!xml) return null;
  // The root <testsuites> tag opens with `<testsuites ` (a single space
  // after the tag name), distinguishing it from nested `<testsuite `
  // opening tags. Match the first such tag in document order.
  const m = /<testsuites\s+([^>]*?)>/.exec(xml);
  if (!m) return null;
  const attrs: Record<string, string> = {};
  for (const am of (m[1] ?? "").matchAll(ATTR_RE)) {
    if (am[1] !== undefined && am[2] !== undefined) attrs[am[1]] = am[2];
  }
  if (Object.keys(attrs).length === 0) return null;
  return {
    tests: Number(attrs.tests ?? 0),
    failures: Number(attrs.failures ?? 0),
    errors: Number(attrs.errors ?? 0),
    skipped: Number(attrs.skipped ?? 0),
    time: Number(attrs.time ?? 0),
  };
}

/**
 * Extract per-suite rows from a JUnit XML document.
 *
 * Tolerates both self-closing (`<testsuite ... />`) and paired
 * (`<testsuite ...>...</testsuite>`) tag forms, the latter being what
 * Bun's reporter emits when the suite has child `<testcase>` elements.
 * The root `<testsuites>` aggregate tag is ignored — only individual
 * suites are returned.
 *
 * NOTE: Bun emits nested `<testsuite>` elements for nested `describe`
 * blocks, so the same set of tests is reported at every nesting level.
 * This function returns ALL suites (parents included) — use
 * `parseRootAggregate` for the de-duplicated Total, which is what
 * `renderTestTable` does. Callers that need only the deepest
 * (leaf-most) suites should filter by direct testcase presence.
 */
export function parseJunitXml(xml: string): SuiteRow[] {
  if (!xml) return [];
  // Match each <testsuite ...> opening tag. `\s+` ensures we don't match
  // the aggregate <testsuites> root. `[^>]*` captures every attribute
  // up to the closing `>`; the trailing `/` (if any) is captured too but
  // ignored by the attribute parser.
  const tagRegex = /<testsuite\s+([^>]*?)>/g;
  const rows: SuiteRow[] = [];

  for (const tagMatch of xml.matchAll(tagRegex)) {
    const attrs = tagMatch[1] ?? "";
    const obj: Record<string, string> = {};
    for (const am of attrs.matchAll(ATTR_RE)) {
      const key = am[1];
      const value = am[2];
      if (key !== undefined && value !== undefined) obj[key] = value;
    }
    rows.push({
      name: obj.name ?? "(unknown)",
      total: Number(obj.tests ?? 0),
      failures: Number(obj.failures ?? 0),
      errors: Number(obj.errors ?? 0),
      skipped: Number(obj.skipped ?? 0),
      time: Number(obj.time ?? 0),
    });
  }
  return rows;
}

/* ─── Formatting helpers ──────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 1) return `${(seconds * 1000).toFixed(1)}ms`;
  return `${seconds.toFixed(2)}s`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

const computePassed = (s: SuiteRow): number =>
  Math.max(0, s.total - s.failures - s.errors - s.skipped);

/* ─── Table renderer ──────────────────────────────────────────────── */

/**
 * Render a JUnit XML test report as a unified per-suite summary table.
 *
 * @param xml     JUnit XML string (Bun's reporter output, or equivalent).
 * @param options Optional display tweaks.
 * @returns       A multi-line string with the rendered table.
 */
export function renderTestTable(
  xml: string,
  options: RenderOptions = {}
): string {
  const opts = { ...DEFAULT_OPTS, ...options };
  const suites = parseJunitXml(xml);

  if (suites.length === 0) {
    return `${DIM}(no test suites found in JUnit report)${RESET}`;
  }

  const headers = ["Suite", "Passed", "Failed", "Skipped", "Duration"] as const;
  const cellKeys = ["name", "passed", "failed", "skipped", "duration"] as const;

  // Build the rows of cell values (stringly).
  const rows: CellRow[] = suites.map((s) => ({
    name: truncate(s.name, opts.maxNameLen),
    passed: String(computePassed(s)),
    failed: String(s.failures + s.errors),
    skipped: String(s.skipped),
    duration: formatDuration(s.time),
  }));

  // Total row: prefer the root <testsuites> aggregate (de-duplicated
  // across nested describes). Falls back to summing per-suite rows
  // when no aggregate is present (e.g. synthetic test fixtures).
  const aggregate = parseRootAggregate(xml);
  const totals: CellRow = aggregate
    ? {
        name: "Total",
        passed: String(
          Math.max(
            0,
            aggregate.tests -
              aggregate.failures -
              aggregate.errors -
              aggregate.skipped
          )
        ),
        failed: String(aggregate.failures + aggregate.errors),
        skipped: String(aggregate.skipped),
        duration: formatDuration(aggregate.time),
      }
    : {
        name: "Total",
        passed: String(rows.reduce((acc, r) => acc + Number(r.passed), 0)),
        failed: String(rows.reduce((acc, r) => acc + Number(r.failed), 0)),
        skipped: String(rows.reduce((acc, r) => acc + Number(r.skipped), 0)),
        duration: formatDuration(suites.reduce((acc, s) => acc + s.time, 0)),
      };

  // Column widths driven by max of header / cell visible length.
  const widths: number[] = cellKeys.map((k, i) => {
    const header = headers[i] ?? k;
    const values = rows.map((r) => r[k]);
    if (opts.showTotal) values.push(totals[k]);
    const maxCell = values.reduce(
      (m, v) => Math.max(m, stripAnsi(v).length),
      0
    );
    return Math.max(header.length, maxCell);
  });

  // Box-drawing chars
  const H = "─";
  const V = "│";
  const TL = "┌";
  const TR = "┐";
  const BL = "└";
  const BR = "┘";
  const T_DOWN = "┬";
  const T_UP = "┴";
  const T_CROSS = "┼";
  const T_RIGHT = "├";
  const T_LEFT = "┤";

  const hLine = (left: string, mid: string, right: string): string => {
    const segments = widths.map((w) => H.repeat(w + 2));
    return `${left}${segments.join(mid)}${right}`;
  };

  const padCell = (
    text: string,
    width: number,
    align: "left" | "right"
  ): string => {
    const visibleLen = stripAnsi(text).length;
    const pad = Math.max(0, width - visibleLen);
    const padded =
      align === "left"
        ? `${text}${" ".repeat(pad)}`
        : `${" ".repeat(pad)}${text}`;
    return ` ${padded} `;
  };

  const colorizeCell = (key: string, value: string): string => {
    if (key === "name" || key === "duration") {
      return key === "duration" ? `${DIM}${value}${RESET}` : value;
    }
    const n = Number(value);
    if (key === "passed") return n > 0 ? `${GREEN}${value}${RESET}` : value;
    if (key === "failed") return n > 0 ? `${RED}${value}${RESET}` : value;
    if (key === "skipped") return n > 0 ? `${YELLOW}${value}${RESET}` : value;
    return value;
  };

  const renderRow = (row: CellRow, boldRow: boolean): string => {
    const cells = cellKeys.map((k, i) => {
      const val = row[k];
      const colored = colorizeCell(k, val);
      const text = boldRow ? `${BOLD}${colored}${RESET}` : colored;
      return padCell(text, widths[i] ?? 0, k === "name" ? "left" : "right");
    });
    return `${V}${cells.join(V)}${V}`;
  };

  const renderHeader = (): string => {
    const cells = headers.map((h, i) =>
      padCell(
        `${BOLD}${CYAN}${h}${RESET}`,
        widths[i] ?? h.length,
        i === 0 ? "left" : "right"
      )
    );
    return `${V}${cells.join(V)}${V}`;
  };

  const out: string[] = [];
  out.push(hLine(TL, T_DOWN, TR));
  out.push(renderHeader());
  out.push(hLine(T_RIGHT, T_CROSS, T_LEFT));
  for (const r of rows) out.push(renderRow(r, false));
  if (opts.showTotal) {
    out.push(hLine(T_RIGHT, T_CROSS, T_LEFT));
    out.push(renderRow(totals, true));
  }
  out.push(hLine(BL, T_UP, BR));

  return out.join("\n");
}
