import { describe, it, expect } from "bun:test";
import type { ViewId } from "@jango-blockchained/hoox-shared";
import {
  VIEW_REGISTRY,
  getSidebarItems,
  getViewShortcutMap,
  getCtrlAltViewMap,
  getViewPaletteCommands,
  getViewFactory,
  ACTION_COMMANDS,
  ALL_PALETTE_COMMANDS,
} from "./view-registry";

const ALL_VIEWS: ViewId[] = [
  "dashboard",
  "workers",
  "worker-detail",
  "trade-monitor",
  "logs-viewer",
  "service-manager",
  "config-editor",
  "setup-wizard",
  "settings",
  "queue-depth",
  "kv-viewer",
  "secrets-viewer",
  "db-query",
  "ai-chat",
  "edge-topology",
  "worker-settings",
];

describe("view-registry", () => {
  it("covers every ViewId exactly once in order", () => {
    expect(VIEW_REGISTRY.map((v) => v.id)).toEqual(ALL_VIEWS);
  });

  it("sidebar items match registry short labels", () => {
    const items = getSidebarItems();
    expect(items).toHaveLength(ALL_VIEWS.length);
    expect(items[0]).toEqual({
      id: "dashboard",
      label: "DASHBOARD",
      shortcut: "1",
    });
  });

  it("Ctrl digit shortcuts map 1-9 and 0", () => {
    const map = getViewShortcutMap();
    expect(map["1"]).toBe("dashboard");
    expect(map["0"]).toBe("queue-depth");
    expect(map["9"]).toBe("settings");
  });

  it("Ctrl+Alt chords map k/s/c/q/e/w", () => {
    const map = getCtrlAltViewMap();
    expect(map.k).toBe("kv-viewer");
    expect(map.s).toBe("secrets-viewer");
    expect(map.c).toBe("ai-chat");
    expect(map.q).toBe("db-query");
    expect(map.e).toBe("edge-topology");
    expect(map.w).toBe("worker-settings");
  });

  it("palette view commands include all views", () => {
    const cmds = getViewPaletteCommands();
    expect(cmds.every((c) => c.category === "view")).toBe(true);
    expect(new Set(cmds.map((c) => c.id))).toEqual(new Set(ALL_VIEWS));
  });

  it("every view has a factory", () => {
    for (const id of ALL_VIEWS) {
      expect(typeof getViewFactory(id)).toBe("function");
    }
  });

  it("action commands include refresh, toggle-sidebar, quit", () => {
    const ids = ACTION_COMMANDS.map((c) => c.id);
    expect(ids).toContain("refresh");
    expect(ids).toContain("toggle-sidebar");
    expect(ids).toContain("quit");
  });

  it("ALL_PALETTE_COMMANDS merges views + actions", () => {
    expect(ALL_PALETTE_COMMANDS.length).toBe(
      getViewPaletteCommands().length + ACTION_COMMANDS.length
    );
  });
});
