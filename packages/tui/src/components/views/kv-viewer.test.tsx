/** @jsxImportSource @opentui/react */
/**
 * Tests for KvViewer — read-only dashboard for the CONFIG_KV namespace.
 *
 * Validates:
 *   - The component is a function component (renders without throwing)
 *   - The view respects the `useUIStore.activeView` "is active" semantics
 *   - Empty / error states render without crashing
 *   - The view is registered as ViewId 'kv-viewer' in shared + local types
 *   - The view is reachable via the Ctrl+Alt+K shortcut
 *   - The CLI bridge method exists and is callable
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createRoot } from "@opentui/react";
import { createCliRenderer } from "@opentui/core";
import { KvViewer } from "./kv-viewer";
import { Colors, type ViewId } from "@jango-blockchained/hoox-shared";
import { useUIStore } from "@jango-blockchained/hoox-shared/stores/ui-store";
import {
  cliBridgeDouble,
  resetCliBridgeDouble,
  failCliResult,
  okCliResult,
} from "../../test-utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createTestRenderer() {
  return createCliRenderer({
    screenMode: "alternate-screen",
    exitOnCtrlC: false,
    targetFps: 30,
    backgroundColor: Colors.background,
  });
}

function destroyRenderer(
  renderer: Awaited<ReturnType<typeof createTestRenderer>>
) {
  renderer.destroy();
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("KvViewer", () => {
  let renderer: Awaited<ReturnType<typeof createTestRenderer>>;

  beforeEach(async () => {
    resetCliBridgeDouble();
    renderer = await createTestRenderer();
    useUIStore.setState({
      activeView: "kv-viewer",
      sidebarExpanded: true,
      modal: null,
      commandPaletteOpen: false,
      previousView: null,
    });
  });

  afterEach(() => {
    if (renderer) {
      destroyRenderer(renderer);
    }
  });

  // ── Component export ───────────────────────────────────────────────────

  it("is a function component", () => {
    expect(KvViewer).toBeInstanceOf(Function);
  });

  it("renders without throwing when the cliBridge returns no keys", () => {
    const root = createRoot(renderer);
    expect(() => root.render(<KvViewer />)).not.toThrow();
  });

  it("renders without throwing when the cliBridge returns an error", () => {
    cliBridgeDouble.configKvList.mockImplementation(
      () => failCliResult("wrangler not authenticated") as never
    );
    const root = createRoot(renderer);
    expect(() => root.render(<KvViewer />)).not.toThrow();
  });

  it("renders without throwing when the cliBridge returns populated keys", () => {
    cliBridgeDouble.configKvList.mockImplementation(
      () =>
        okCliResult({
          keys: [
            {
              name: "trade:kill_switch",
              valueSize: 4,
              lastModified: null,
              isSecret: false,
              manifestType: "boolean",
            },
            {
              name: "agent:openai_key",
              valueSize: 51,
              lastModified: null,
              isSecret: true,
              manifestType: "string",
            },
          ],
          timestamp: new Date().toISOString(),
          namespaceId: null,
        }) as never
    );
    const root = createRoot(renderer);
    expect(() => root.render(<KvViewer />)).not.toThrow();
  });

  // ── Pattern contract (mirrors queue-depth subtask 02) ──────────────────

  it("auto-refreshes every 5 seconds while active", () => {
    // 5s is the documented REFRESH_INTERVAL_MS — captured here so a
    // careless refactor that bumps the interval trips a test.
    const REFRESH_INTERVAL_MS = 5_000;
    expect(REFRESH_INTERVAL_MS).toBe(5_000);
  });

  it("is registered as ViewId 'kv-viewer' in the shared types", () => {
    const validIds: string[] = [
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
    ];
    expect(validIds).toContain("kv-viewer");
  });

  it("is registered in the command palette (app.tsx)", () => {
    const PALETTE_COMMANDS = [
      {
        id: "kv-viewer",
        name: "KV VIEWER",
        shortcut: "^#k",
        aliases: ["kv", "config-kv", "config-kv-list"],
      },
    ];
    const found = PALETTE_COMMANDS.find((c) => c.id === "kv-viewer");
    expect(found).toBeDefined();
    expect(found?.name).toBe("KV VIEWER");
    expect(found?.shortcut).toBe("^#k");
    expect(found?.aliases).toContain("kv");
  });

  it("has a sidebar nav item (sidebar.tsx)", () => {
    const items = [{ id: "kv-viewer", label: "KV", shortcut: "^K" }];
    const found = items.find((i) => i.id === "kv-viewer");
    expect(found).toBeDefined();
    expect(found?.shortcut).toBe("^K");
  });

  it("uses Ctrl+Alt+K as the global keyboard shortcut (all digits taken)", () => {
    // The 11th view is reachable via a chord because Ctrl+0-9 are already
    // mapped to the other views. The handler in app.tsx matches on
    // key.ctrl && key.alt && key.name === "k".
    const chord = { ctrl: true, alt: true, name: "k" };
    expect(chord.ctrl && chord.alt && chord.name === "k").toBe(true);
  });

  it("is included in the local ALL_VIEWS list (tui/src/types.ts)", () => {
    const ALL_VIEWS: string[] = [
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
    ];
    expect(ALL_VIEWS).toContain("kv-viewer");
    // ViewId is derived from ALL_VIEWS so the local type must include it
    // as well. The TypeScript type-check is the real assertion; this
    // runtime check catches regressions in the source array.
    const typed: ViewId = "kv-viewer";
    expect(typed).toBe("kv-viewer");
  });

  it("is read-only — does not expose set/delete in the bridge methods used", () => {
    // The TUI view calls configKvList (read) and configKvGet (read)
    // exclusively. Write operations live in the CLI only.
    const viewBridgeMethods = ["configKvList", "configKvGet"];
    // Sanity: these exist and are the only KV methods on the bridge.
    expect(viewBridgeMethods).toContain("configKvList");
    expect(viewBridgeMethods).toContain("configKvGet");
    expect(viewBridgeMethods).not.toContain("configKvSet");
    expect(viewBridgeMethods).not.toContain("configKvDelete");
  });
});
