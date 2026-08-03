/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  parseJunitXml,
  parseRootAggregate,
  renderTestTable,
} from "./render-test-table.ts";

/** Strip ANSI escape codes so regex word-boundaries behave normally. */
// eslint-disable-next-line no-control-regex -- matches the renderer; \x1b is the ESC byte
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

const TWO_SUITES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="a.test.ts" tests="3" failures="1" errors="0" skipped="0" time="0.124"/>
  <testsuite name="b.test.ts" tests="2" failures="0" errors="0" skipped="1" time="0.256"/>
</testsuites>`;

const SINGLE_SUITE_XML = `<testsuites><testsuite name="only" tests="10" failures="2" errors="0" skipped="1" time="1.0"/></testsuites>`;

describe("parseJunitXml", () => {
  it("returns an empty array for empty input", () => {
    expect(parseJunitXml("")).toEqual([]);
  });

  it("returns an empty array when no <testsuite> tags are present", () => {
    expect(parseJunitXml("<testsuites></testsuites>")).toEqual([]);
  });

  it("extracts per-suite stats from a self-closing tag", () => {
    const rows = parseJunitXml(SINGLE_SUITE_XML);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.name).toBe("only");
    expect(row?.total).toBe(10);
    expect(row?.failures).toBe(2);
    expect(row?.errors).toBe(0);
    expect(row?.skipped).toBe(1);
    expect(row?.time).toBe(1.0);
  });

  it("extracts multiple suites in document order", () => {
    const rows = parseJunitXml(TWO_SUITES_XML);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe("a.test.ts");
    expect(rows[1]?.name).toBe("b.test.ts");
    expect(rows[1]?.skipped).toBe(1);
  });

  it("ignores the aggregate <testsuites> root tag", () => {
    const rows = parseJunitXml(TWO_SUITES_XML);
    // Should NOT include a row with name === "testsuites"
    expect(rows.find((r) => r.name === "testsuites")).toBeUndefined();
  });

  it("tolerates paired (non-self-closing) testsuite tags", () => {
    const xml = `<testsuites>
      <testsuite name="x.test.ts" tests="2" failures="0" errors="0" skipped="0" time="0.05">
        <testcase name="t1" time="0.01"/>
        <testcase name="t2" time="0.04"/>
      </testsuite>
    </testsuites>`;
    const rows = parseJunitXml(xml);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("x.test.ts");
    expect(rows[0]?.total).toBe(2);
  });
});

describe("parseRootAggregate", () => {
  it("returns null for empty input", () => {
    expect(parseRootAggregate("")).toBeNull();
  });

  it("returns null when the <testsuites> root is missing", () => {
    const xml = `<testsuite name="x" tests="1" failures="0"/>`;
    expect(parseRootAggregate(xml)).toBeNull();
  });

  it("extracts aggregate totals from a real Bun JUnit report shape", () => {
    // Mirrors the structure Bun's JUnit reporter emits.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="493" assertions="1109" failures="12" skipped="0" time="18.557104502">
  <testsuite name="X.test.ts" tests="16" failures="7" errors="0" skipped="0" time="0">
    <testsuite name="describe A" tests="11" failures="7" errors="0" skipped="0" time="0">
      <testcase name="t1" time="0"/>
    </testsuite>
  </testsuite>
</testsuites>`;
    const agg = parseRootAggregate(xml);
    expect(agg).not.toBeNull();
    expect(agg?.tests).toBe(493);
    expect(agg?.failures).toBe(12);
    expect(agg?.errors).toBe(0);
    expect(agg?.skipped).toBe(0);
    expect(agg?.time).toBeCloseTo(18.557104502);
  });
});

describe("renderTestTable (nested describes)", () => {
  // Real-world shape: Bun emits a parent testsuite (file-level), an
  // intermediate testsuite (outer describe), and a leaf testsuite
  // (inner describe) for nested describes. The same failing test is
  // counted in every level — so summing the per-suite rows over-counts
  // and the Total must come from the <testsuites> aggregate instead.
  const NESTED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="16" failures="7" errors="0" skipped="0" time="0.5">
  <testsuite name="X.test.ts" tests="16" failures="7" errors="0" skipped="0" time="0">
    <testsuite name="outer describe" tests="16" failures="7" errors="0" skipped="0" time="0">
      <testcase name="t1" time="0"/>
      <testcase name="t2" time="0"><failure/></testcase>
      <testsuite name="inner describe" tests="3" failures="2" errors="0" skipped="0" time="0">
        <testcase name="t3" time="0"><failure/></testcase>
        <testcase name="t4" time="0"><failure/></testcase>
        <testcase name="t5" time="0"/>
      </testsuite>
    </testsuite>
  </testsuite>
</testsuites>`;

  it("Total row uses the de-duplicated root aggregate, not a sum of nested rows", () => {
    const out = renderTestTable(NESTED_XML);
    const lines = out.split("\n");
    const totalLine = lines.find((l) => l.includes("Total"));
    expect(totalLine).toBeDefined();
    const plain = stripAnsi(totalLine ?? "");
    // Per the root <testsuites tests="16" failures="7">:
    //   passed = 16 - 7 - 0 - 0 = 9
    //   failed = 7
    expect(plain).toMatch(/\b9\b/);
    expect(plain).toMatch(/\b7\b/);
  });

  it("per-suite rows still report the per-level failure count (not deduplicated)", () => {
    const out = renderTestTable(NESTED_XML);
    // The 'inner describe' leaf suite has failures="2" — this row must
    // show '2' in the Failed column even though the Total only has 7
    // unique failures.
    const lines = out.split("\n");
    const innerLine = lines.find((l) => l.includes("inner describe"));
    expect(innerLine).toBeDefined();
    const plain = stripAnsi(innerLine ?? "");
    expect(plain).toMatch(/\b2\b/);
  });

  it("Total row falls back to summing per-suite rows when no aggregate is present", () => {
    // No <testsuites> root → Total is computed from per-suite rows.
    // Suite a: 3-1 = 2 passed.  Suite b: 2-0 = 2 passed.  → 4 passed, 1 failed.
    const xml = `<testsuite name="a" tests="3" failures="1"/><testsuite name="b" tests="2" failures="0"/>`;
    const out = renderTestTable(xml);
    const lines = out.split("\n");
    const totalLine = lines.find((l) => l.includes("Total"));
    const plain = stripAnsi(totalLine ?? "");
    expect(plain).toMatch(/\b4\b/); // 4 passed (2+2)
    expect(plain).toMatch(/\b1\b/); // 1 failed (1+0)
  });
});

describe("renderTestTable", () => {
  it("renders all required column headers", () => {
    const out = renderTestTable(SINGLE_SUITE_XML);
    expect(out).toContain("Suite");
    expect(out).toContain("Passed");
    expect(out).toContain("Failed");
    expect(out).toContain("Skipped");
    expect(out).toContain("Duration");
  });

  it("renders a Total row by default", () => {
    const out = renderTestTable(SINGLE_SUITE_XML);
    expect(out).toContain("Total");
  });

  it("omits the Total row when showTotal is false", () => {
    const out = renderTestTable(SINGLE_SUITE_XML, { showTotal: false });
    expect(out).not.toContain("Total");
  });

  it("computes passed as total - failures - errors - skipped", () => {
    // 10 - 2 - 0 - 1 = 7 passed
    const out = stripAnsi(renderTestTable(SINGLE_SUITE_XML));
    expect(out).toMatch(/\b7\b/);
  });

  it("sums failures + errors into the Failed column", () => {
    const xml = `<testsuites><testsuite name="x" tests="5" failures="1" errors="2" skipped="0" time="0.1"/></testsuites>`;
    const out = stripAnsi(renderTestTable(xml));
    // 1 + 2 = 3 failed
    expect(out).toMatch(/\b3\b/);
  });

  it("renders one row per suite", () => {
    const out = renderTestTable(TWO_SUITES_XML);
    expect(out).toContain("a.test.ts");
    expect(out).toContain("b.test.ts");
  });

  it("aggregates totals across multiple suites", () => {
    // a: 3-1-0-0 = 2 passed, 1 failed, 0 skipped
    // b: 2-0-0-1 = 1 passed, 0 failed, 1 skipped
    // total: 3 passed, 1 failed, 1 skipped
    const out = renderTestTable(TWO_SUITES_XML);
    // The total row is the last data row; look for the totals line.
    const lines = out.split("\n");
    const totalLine = lines.find((l) => l.includes("Total"));
    expect(totalLine).toBeDefined();
    const plain = stripAnsi(totalLine ?? "");
    expect(plain).toMatch(/\b3\b/); // 3 passed
    expect(plain).toMatch(/\b1\b/); // 1 failed
  });

  it("uses a graceful fallback for empty JUnit input", () => {
    const out = renderTestTable("");
    expect(out).toContain("no test suites");
  });

  it("truncates long suite names with an ellipsis", () => {
    const longName = "x".repeat(100);
    const xml = `<testsuites><testsuite name="${longName}" tests="1" failures="0" errors="0" skipped="0" time="0.1"/></testsuites>`;
    const out = renderTestTable(xml, { maxNameLen: 20 });
    expect(out).not.toContain(longName);
    expect(out).toContain("…");
  });

  it("uses Unicode box-drawing characters for the table border", () => {
    const out = renderTestTable(SINGLE_SUITE_XML);
    expect(out).toContain("┌");
    expect(out).toContain("┐");
    expect(out).toContain("└");
    expect(out).toContain("┘");
    expect(out).toContain("─");
    expect(out).toContain("│");
  });

  it("formats sub-second durations as milliseconds", () => {
    const xml = `<testsuites><testsuite name="x" tests="1" failures="0" errors="0" skipped="0" time="0.123"/></testsuites>`;
    const out = renderTestTable(xml);
    expect(out).toMatch(/123\.0ms|123ms/);
  });

  it("formats durations >= 1 second with the 's' suffix", () => {
    const xml = `<testsuites><testsuite name="x" tests="1" failures="0" errors="0" skipped="0" time="2.5"/></testsuites>`;
    const out = renderTestTable(xml);
    expect(out).toContain("2.50s");
  });
});
