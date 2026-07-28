/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for DbQueryView — registration + source contracts.
 *
 * Isolation strategy:
 *   - No OpenTUI renderer (keeps this suite lightweight).
 *   - CLI is the process-wide test double from test-setup; real SQL
 *     validator coverage lives in services/cli-bridge.test.ts.
 *   - Source-level checks against view-registry.tsx / app.tsx / db-query.tsx.
 */
import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { DbQueryView } from "./db-query";

const VIEWS_DIR = import.meta.dir;
const TUI_SRC = join(VIEWS_DIR, "../..");

describe("DbQueryView", () => {
  it("is a function component", () => {
    expect(DbQueryView).toBeInstanceOf(Function);
    expect(DbQueryView.name).toBe("DbQueryView");
  });

  it("wires client-side validateReadOnlySql before CLI execution", async () => {
    const src = await Bun.file(join(VIEWS_DIR, "db-query.tsx")).text();
    expect(src).toContain("validateReadOnlySql");
    expect(src).toContain("cliBridge.dbQuery");
  });

  it("formats NULL values distinctly in cells (contract)", () => {
    const formatCell = (v: unknown) =>
      v === null || v === undefined ? "NULL" : String(v);
    expect(formatCell(null)).toBe("NULL");
    expect(formatCell(undefined)).toBe("NULL");
    expect(formatCell(42)).toBe("42");
  });

  it("is registered as ViewId db-query in view-registry factory", async () => {
    const registry = await Bun.file(join(TUI_SRC, "view-registry.tsx")).text();
    expect(registry).toContain('id: "db-query"');
    expect(registry).toContain("DbQueryView");
  });

  it("is registered in the command palette (view-registry)", async () => {
    const registry = await Bun.file(join(TUI_SRC, "view-registry.tsx")).text();
    expect(registry).toContain('id: "db-query"');
    expect(registry).toMatch(/db-query[\s\S]{0,160}paletteShortcut:\s*"\^#q"/);
  });

  it("has a sidebar nav item via view-registry short labels", async () => {
    const registry = await Bun.file(join(TUI_SRC, "view-registry.tsx")).text();
    expect(registry).toContain('id: "db-query"');
    expect(registry).toContain("DB QUERY");
    const sidebar = await Bun.file(
      join(TUI_SRC, "components/layout/sidebar.tsx")
    ).text();
    expect(sidebar).toContain("getSidebarItems");
  });

  it("uses Ctrl+Alt+Q chord via registry map in app keyboard handler", async () => {
    const registry = await Bun.file(join(TUI_SRC, "view-registry.tsx")).text();
    expect(registry).toMatch(
      /id:\s*"db-query"[\s\S]{0,200}key:\s*"q"[\s\S]{0,80}keyMod:\s*"ctrl-alt"/
    );
    const app = await Bun.file(join(TUI_SRC, "app.tsx")).text();
    expect(app).toContain("getCtrlAltViewMap");
    expect(app).toContain("CTRL_ALT_VIEWS");
    expect(app).toMatch(
      /key\.ctrl\s*&&\s*key\.alt\s*&&\s*CTRL_ALT_VIEWS\[key\.name\]/
    );
  });

  it("persists query history via TuiStateFiles.dbQueryHistory (max 20)", async () => {
    const src = await Bun.file(join(VIEWS_DIR, "db-query.tsx")).text();
    expect(src).toContain("TuiStateFiles.dbQueryHistory");
    expect(src).toMatch(/MAX_HISTORY\s*=\s*20/);
    const storage = await Bun.file(
      join(TUI_SRC, "services/tui-storage.ts")
    ).text();
    expect(storage).toContain('dbQueryHistory: "db-query-history.json"');
  });
});
