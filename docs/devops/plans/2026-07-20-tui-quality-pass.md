<!--
  Copyright (c) 2026 HOOX · jango-blockchained (hoox-sh)
  SPDX-License-Identifier: CC-BY-4.0
-->

# TUI Balanced Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Hoox TUI with conservative brand DNA: shared semantic color maps, a single view registry, shared chrome (`ViewHeader`/`Panel`), and shell thinning — without light theme or monster-view rewrites.

**Architecture:** Extend `packages/shared/src/colors.ts` with semantic maps + `backdrop`; TUI consumes only tokens/maps. Introduce `packages/tui/src/view-registry.ts` as the sole source for view factories, sidebar items, shortcuts, and palette view commands. Add small chrome components and wire them into high-traffic views. Keep data/SSE paths untouched.

**Tech Stack:** Bun, TypeScript, OpenTUI (`@opentui/react`), React 19, Zustand stores in `@hoox-sh/hoox-shared`.

**Spec:** `docs/devops/specs/2026-07-20-tui-quality-pass-design.md`

---

## File map

| Path                                                     | Responsibility                                             |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/shared/src/colors.ts`                          | Tokens + semantic maps + `backdrop`                        |
| `packages/shared/src/index.ts`                           | Export new maps/types                                      |
| `packages/tui/src/view-registry.ts`                      | View metadata, factories, derived helpers, action commands |
| `packages/tui/src/view-registry.test.ts`                 | Exhaustiveness / shortcut / palette tests                  |
| `packages/tui/src/components/shared/view-header.tsx`     | Consistent view title row                                  |
| `packages/tui/src/components/shared/panel.tsx`           | Bordered elevated box                                      |
| `packages/tui/src/components/shared/quit-modal.tsx`      | Quit confirmation overlay                                  |
| `packages/tui/src/main.tsx`                              | Use `Colors.background`                                    |
| `packages/tui/src/app.tsx`                               | Registry + quit modal; thinner shell                       |
| `packages/tui/src/components/layout/sidebar.tsx`         | Registry-driven items                                      |
| `packages/tui/src/components/layout/statusbar.tsx`       | `ConnectionStatusColor`                                    |
| `packages/tui/src/components/shared/status-dot.tsx`      | `WorkerStatusColor`                                        |
| `packages/tui/src/components/views/logs-viewer.tsx`      | `LogLevelColor`                                            |
| `packages/tui/src/components/views/dashboard.tsx`        | Adopt `ViewHeader` (and Panel where natural)               |
| `packages/tui/src/components/views/workers-overview.tsx` | Adopt `Panel` / `ViewHeader` where natural                 |
| `packages/tui/src/utils/colors.test.ts`                  | Import shared tokens/maps                                  |
| `packages/tui/src/components/shared/shared.test.tsx`     | Align hex expectations with shared maps                    |

---

### Task 1: Shared semantic color maps

**Files:**

- Modify: `packages/shared/src/colors.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/tui/src/utils/colors.test.ts` (updated in Task 2; shared has no dedicated colors unit file — DNA tests live under TUI)

- [x] **Step 1: Extend `packages/shared/src/colors.ts`**

Replace/extend the file so it contains tokens + maps:

```ts
/**
 * Color Tokens — Maps hoox landing page design system to terminal-safe RGBA hex values.
 *
 * Design DNA:
 *   - Dark monochrome background: oklch(0.08 0 0) → #0D1117
 *   - Orange accent: oklch(0.7 0.2 45) → #E8780A
 *   - Squared edges (no rounding — editorial aesthetic)
 *
 * Usage: import { Colors, ConnectionStatusColor } from "@hoox-sh/hoox-shared"
 *        <text fg={Colors.accent}>Important</text>
 */

export const Colors = {
  // Base
  background: "#0D1117",
  foreground: "#EEEEEE",
  card: "#1C1C1F",
  border: "#484848",
  muted: "#A0A0A0",
  "muted-foreground": "#6E6E6E",
  dim: "#3B3B3D",

  // Accent
  accent: "#E8780A",
  "accent-dim": "#B85E08",

  // Status colors
  success: "#00FF88",
  warning: "#FFAA00",
  error: "#FF4444",
  info: "#4488FF",

  // Semantic aliases
  text: "#EEEEEE",
  "text-muted": "#A0A0A0",
  panel: "#1C1C1F",
  divider: "#484848",
  highlight: "#E8780A",

  /** Dialog / overlay dim only — not a surface color */
  backdrop: "#000000",
} as const;

export type ColorKey = keyof typeof Colors;

/** Connection pill colors (status bar). */
export const ConnectionStatusColor = {
  connected: Colors.success,
  polling: Colors.accent,
  reconnecting: Colors.warning,
  offline: Colors.error,
} as const;

export type ConnectionStatusKey = keyof typeof ConnectionStatusColor;

/** Worker / service health colors. */
export const WorkerStatusColor = {
  operational: Colors.success,
  degraded: Colors.warning,
  down: Colors.error,
} as const;

export type WorkerStatusKey = keyof typeof WorkerStatusColor;

/** Log stream level colors. `debug` uses muted (readable), not dim. */
export const LogLevelColor = {
  error: Colors.error,
  warn: Colors.warning,
  info: Colors.foreground,
  debug: Colors.muted,
} as const;

export type LogLevelColorKey = keyof typeof LogLevelColor;

/** Alert severity colors. */
export const AlertSeverityColor = {
  info: Colors.info,
  warning: Colors.warning,
  error: Colors.error,
  critical: Colors.error,
} as const;

export type AlertSeverityColorKey = keyof typeof AlertSeverityColor;
```

- [x] **Step 2: Export from `packages/shared/src/index.ts`**

Find:

```ts
export { Colors } from "./colors";
export type { ColorKey } from "./colors";
```

Replace with:

```ts
export {
  Colors,
  ConnectionStatusColor,
  WorkerStatusColor,
  LogLevelColor,
  AlertSeverityColor,
} from "./colors";
export type {
  ColorKey,
  ConnectionStatusKey,
  WorkerStatusKey,
  LogLevelColorKey,
  AlertSeverityColorKey,
} from "./colors";
```

- [x] **Step 3: Build / typecheck shared surface**

Run:

```bash
cd /home/jango/Git/hoox-setup && bun run typecheck 2>&1 | tail -40
```

Expected: no new errors related to `colors` exports (full monorepo typecheck may show pre-existing issues elsewhere; at minimum):

```bash
cd /home/jango/Git/hoox-setup/packages/shared && bunx tsc --noEmit 2>&1 | tail -20
```

If shared package lacks a standalone typecheck script, run root `scripts/typecheck-all` or `bun run typecheck` and confirm colors-related files clean.

- [x] **Step 4: Commit**

```bash
git add packages/shared/src/colors.ts packages/shared/src/index.ts
git commit -m "feat(shared): add semantic status color maps and backdrop token"
```

---

### Task 2: Point color tests at shared source of truth

**Files:**

- Modify: `packages/tui/src/utils/colors.test.ts`
- Modify: `packages/tui/src/components/shared/shared.test.tsx` (hex assertions only if needed)

- [x] **Step 1: Rewrite colors.test.ts to import shared Colors + maps**

Key structure (keep helpers `hexToRgb`, `relativeLuminance`, `contrastRatio`; remove local `Colors` object):

```ts
import { describe, it, expect } from "bun:test";
import {
  Colors,
  ConnectionStatusColor,
  WorkerStatusColor,
  LogLevelColor,
  AlertSeverityColor,
} from "@hoox-sh/hoox-shared";

// keep hexToRgb / contrast helpers...

describe("Colors Design System", () => {
  // existing DNA + contrast tests, but use imported Colors
  // token completeness: Object.keys(Colors) now includes backdrop
  // adjust "exactly 13 color tokens" → count actual keys or assert required set includes backdrop
});

describe("status color mappings", () => {
  it("connection status maps to correct colors", () => {
    expect(ConnectionStatusColor.connected).toBe(Colors.success);
    expect(ConnectionStatusColor.polling).toBe(Colors.accent);
    expect(ConnectionStatusColor.reconnecting).toBe(Colors.warning);
    expect(ConnectionStatusColor.offline).toBe(Colors.error);
  });

  it("alert severity maps to correct colors", () => {
    expect(AlertSeverityColor.info).toBe(Colors.info);
    expect(AlertSeverityColor.warning).toBe(Colors.warning);
    expect(AlertSeverityColor.error).toBe(Colors.error);
    expect(AlertSeverityColor.critical).toBe(Colors.error);
  });

  it("worker status maps to correct colors", () => {
    expect(WorkerStatusColor.operational).toBe(Colors.success);
    expect(WorkerStatusColor.degraded).toBe(Colors.warning);
    expect(WorkerStatusColor.down).toBe(Colors.error);
  });

  it("log level maps to correct colors", () => {
    expect(LogLevelColor.debug).toBe(Colors.muted);
    expect(LogLevelColor.info).toBe(Colors.foreground);
    expect(LogLevelColor.warn).toBe(Colors.warning);
    expect(LogLevelColor.error).toBe(Colors.error);
  });
});
```

Update token completeness:

- Required set includes `"backdrop"`.
- Do not hard-require length `13` if new keys were added — assert `Object.keys(Colors).length >= 14` or list required keys including aliases still present.

- [x] **Step 2: Run colors tests**

```bash
cd /home/jango/Git/hoox-setup/packages/tui && bun test --preload ./src/test-setup.ts src/utils/colors.test.ts
```

Expected: all pass. If import path fails, confirm workspace links `@hoox-sh/hoox-shared` (package name in monorepo).

- [x] **Step 3: Commit**

```bash
git add packages/tui/src/utils/colors.test.ts
git commit -m "test(tui): bind color tests to shared tokens and status maps"
```

---

### Task 3: Wire TUI consumers to semantic maps + token backgrounds

**Files:**

- Modify: `packages/tui/src/main.tsx`
- Modify: `packages/tui/src/app.tsx` (backdrop only this task)
- Modify: `packages/tui/src/components/layout/statusbar.tsx`
- Modify: `packages/tui/src/components/shared/status-dot.tsx`
- Modify: `packages/tui/src/components/views/logs-viewer.tsx`
- Grep sweep for other local status maps

- [x] **Step 1: main.tsx**

```ts
import { Colors } from "@hoox-sh/hoox-shared";
// ...
const RENDERER_CONFIG = {
  // ...
  backgroundColor: Colors.background,
  // ...
};
```

- [x] **Step 2: app.tsx DialogProvider backdrop**

```ts
import { Colors, ... } from "@hoox-sh/hoox-shared";
// ...
<DialogProvider
  size="medium"
  backdropColor={Colors.backdrop}
  backdropOpacity={0.35}
>
```

- [x] **Step 3: statusbar.tsx**

Import `ConnectionStatusColor`. Replace local `statusColor` object with:

```ts
const statusColor = ConnectionStatusColor;
// usage:
statusColor[connectionStatus as keyof typeof ConnectionStatusColor] ??
  Colors.muted;
```

(Or a small helper that narrows `connectionStatus`.)

- [x] **Step 4: status-dot.tsx**

```ts
import { Colors, WorkerStatusColor } from "@hoox-sh/hoox-shared";

const DOT_COLOR = WorkerStatusColor;
// DOT_CHAR stays local
```

Ensure `StatusDotStatus` remains assignable to `WorkerStatusKey`.

- [x] **Step 5: logs-viewer.tsx**

```ts
import { Colors, LogLevelColor, ... } from "@hoox-sh/hoox-shared";

// remove local LEVEL_FG; use LogLevelColor everywhere LEVEL_FG was used
```

- [x] **Step 6: Grep for remaining local maps / brand hex**

```bash
cd /home/jango/Git/hoox-setup && rg -n 'LEVEL_FG|statusColor\s*[:=]|#0D1117|#E8780A|#00FF88|#FF4444|#FFAA00|#4488FF|#000000' packages/tui/src --glob '!**/*.test.*'
```

Fix any production hits to use shared tokens/maps. Tests may still mention hex when asserting DNA values.

- [x] **Step 7: Run focused tests**

```bash
cd /home/jango/Git/hoox-setup/packages/tui && bun test --preload ./src/test-setup.ts \
  src/utils/colors.test.ts \
  src/components/shared/shared.test.tsx \
  src/components/layout/statusbar.test.tsx \
  src/components/views/logs-viewer.test.tsx
```

Expected: pass (update shared.test hex for debug if it still expects `#3B3B3D` for debug).

- [x] **Step 8: Commit**

```bash
git add packages/tui/src/main.tsx packages/tui/src/app.tsx \
  packages/tui/src/components/layout/statusbar.tsx \
  packages/tui/src/components/shared/status-dot.tsx \
  packages/tui/src/components/views/logs-viewer.tsx \
  packages/tui/src/components/shared/shared.test.tsx
git commit -m "refactor(tui): consume shared status colors and token backgrounds"
```

---

### Task 4: View registry (TDD)

**Files:**

- Create: `packages/tui/src/view-registry.ts`
- Create: `packages/tui/src/view-registry.test.ts`
- Modify: `packages/tui/src/app.tsx`
- Modify: `packages/tui/src/components/layout/sidebar.tsx`

- [x] **Step 1: Write failing registry tests**

Create `packages/tui/src/view-registry.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import type { ViewId } from "@hoox-sh/hoox-shared";
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

  it("Ctrl+Alt chords map k/s/c/q/e", () => {
    const map = getCtrlAltViewMap();
    expect(map.k).toBe("kv-viewer");
    expect(map.s).toBe("secrets-viewer");
    expect(map.c).toBe("ai-chat");
    expect(map.q).toBe("db-query");
    expect(map.e).toBe("edge-topology");
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
```

- [x] **Step 2: Run tests — expect fail**

```bash
cd /home/jango/Git/hoox-setup/packages/tui && bun test --preload ./src/test-setup.ts src/view-registry.test.ts
```

Expected: fail (module not found).

- [x] **Step 3: Implement `packages/tui/src/view-registry.ts`**

Move view imports and factories from `app.tsx`. Shape:

```ts
/** @jsxImportSource @opentui/react */
import type { ViewId } from "@hoox-sh/hoox-shared";
import type { DialogHandle } from "./components/ui/dialog";
import type { CommandEntry } from "./components/shared/command-palette";

import { DashboardView } from "./components/views/dashboard";
// ... all other view imports from app.tsx ...

export type ViewFactory = (dialog: DialogHandle) => React.ReactNode;

export type ViewKeyMod = "ctrl" | "ctrl-alt";

export interface ViewRegistryEntry {
  id: ViewId;
  /** Palette long name */
  label: string;
  /** Sidebar short name */
  shortLabel: string;
  /** Human hint in sidebar (e.g. "1", "^K") */
  shortcut: string;
  /** Key name for keyboard handler (digit or letter) */
  key: string;
  keyMod: ViewKeyMod;
  aliases?: string[];
  /** Palette shortcut display (e.g. "^1", "^#k") */
  paletteShortcut?: string;
  factory: ViewFactory;
}

export const VIEW_REGISTRY: ViewRegistryEntry[] = [
  {
    id: "dashboard",
    label: "DASHBOARD",
    shortLabel: "DASHBOARD",
    shortcut: "1",
    key: "1",
    keyMod: "ctrl",
    paletteShortcut: "^1",
    aliases: ["home", "overview"],
    factory: (dialog) => <DashboardView dialog={dialog} />,
  },
  // ... workers through edge-topology — match app.tsx + sidebar labels/shortcuts exactly ...
  {
    id: "kv-viewer",
    label: "KV VIEWER",
    shortLabel: "KV",
    shortcut: "^K",
    key: "k",
    keyMod: "ctrl-alt",
    paletteShortcut: "^#k",
    aliases: ["kv", "config-kv", "config-kv-list"],
    factory: () => <KvViewer />,
  },
  // ...
];

// Compile-time exhaustiveness helper (call once at module load)
function assertFullCoverage(entries: ViewRegistryEntry[]): void {
  const ids = new Set(entries.map((e) => e.id));
  const required: ViewId[] = [
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
  ];
  for (const id of required) {
    if (!ids.has(id)) throw new Error(`view-registry missing ViewId: ${id}`);
  }
}
assertFullCoverage(VIEW_REGISTRY);

export function getSidebarItems(): {
  id: ViewId;
  label: string;
  shortcut: string;
}[] {
  return VIEW_REGISTRY.map((e) => ({
    id: e.id,
    label: e.shortLabel,
    shortcut: e.shortcut,
  }));
}

export function getViewShortcutMap(): Record<string, ViewId> {
  const map: Record<string, ViewId> = {};
  for (const e of VIEW_REGISTRY) {
    if (e.keyMod === "ctrl") map[e.key] = e.id;
  }
  return map;
}

export function getCtrlAltViewMap(): Record<string, ViewId> {
  const map: Record<string, ViewId> = {};
  for (const e of VIEW_REGISTRY) {
    if (e.keyMod === "ctrl-alt") map[e.key] = e.id;
  }
  return map;
}

export function getViewFactory(id: ViewId): ViewFactory {
  const entry = VIEW_REGISTRY.find((e) => e.id === id);
  return entry?.factory ?? VIEW_REGISTRY[0]!.factory;
}

export function getViewPaletteCommands(): CommandEntry[] {
  return VIEW_REGISTRY.map((e) => ({
    id: e.id,
    name: e.label,
    category: "view" as const,
    shortcut: e.paletteShortcut,
    aliases: e.aliases,
  }));
}

export const ACTION_COMMANDS: CommandEntry[] = [
  {
    id: "refresh",
    name: "REFRESH DATA",
    category: "action",
    shortcut: "^R",
    aliases: ["reload"],
  },
  {
    id: "toggle-sidebar",
    name: "TOGGLE SIDEBAR",
    category: "action",
    shortcut: "^B",
    aliases: ["collapse"],
  },
  {
    id: "quit",
    name: "QUIT HOOX",
    category: "action",
    shortcut: "^Q",
    aliases: ["exit", "close"],
  },
];

export const ALL_PALETTE_COMMANDS: CommandEntry[] = [
  ...getViewPaletteCommands(),
  ...ACTION_COMMANDS,
];
```

Fill every entry from current `app.tsx` `VIEWS` / `PALETTE_COMMANDS` / `sidebar` labels. Palette `name` for workers stays `"WORKERS OVERVIEW"` etc. (use `label` field for palette, `shortLabel` for sidebar).

- [x] **Step 4: Run registry tests — expect pass**

```bash
cd /home/jango/Git/hoox-setup/packages/tui && bun test --preload ./src/test-setup.ts src/view-registry.test.ts
```

- [x] **Step 5: Wire `sidebar.tsx`**

```ts
import { getSidebarItems } from "../../view-registry";

export function Sidebar() {
  // ...
  const items = getSidebarItems();
  // footer:
  // <text fg={Colors.dim} dim>Ctrl+0-9 · Ctrl+Alt+K/S/C/Q/E</text>
}
```

- [x] **Step 6: Wire `app.tsx`**

Remove local `VIEWS`, `VIEW_SHORTCUTS`, view portion of `PALETTE_COMMANDS`, and view component imports that only the registry needs.

```ts
import {
  getViewFactory,
  getViewShortcutMap,
  getCtrlAltViewMap,
  ALL_PALETTE_COMMANDS,
} from "./view-registry";

const VIEW_SHORTCUTS = getViewShortcutMap();
const CTRL_ALT_VIEWS = getCtrlAltViewMap();

// keyboard:
if (key.ctrl && !key.alt && VIEW_SHORTCUTS[key.name]) {
  setView(VIEW_SHORTCUTS[key.name]);
  return;
}
if (key.ctrl && key.alt && CTRL_ALT_VIEWS[key.name]) {
  setView(CTRL_ALT_VIEWS[key.name]);
  return;
}

// render:
const renderView = getViewFactory(activeView);

// palette:
commands = { ALL_PALETTE_COMMANDS };
```

Delete the five separate Ctrl+Alt if-blocks once the map handles them.

- [x] **Step 7: Run navigation + layout tests**

```bash
cd /home/jango/Git/hoox-setup/packages/tui && bun test --preload ./src/test-setup.ts \
  src/view-registry.test.ts \
  test/integration/navigation.test.tsx \
  src/components/layout/layout.test.tsx
```

Expected: pass.

- [x] **Step 8: Commit**

```bash
git add packages/tui/src/view-registry.ts packages/tui/src/view-registry.test.ts \
  packages/tui/src/app.tsx packages/tui/src/components/layout/sidebar.tsx
git commit -m "refactor(tui): single view registry for nav, shortcuts, and factories"
```

---

### Task 5: Shared chrome — ViewHeader + Panel

**Files:**

- Create: `packages/tui/src/components/shared/view-header.tsx`
- Create: `packages/tui/src/components/shared/panel.tsx`
- Create: `packages/tui/src/components/shared/chrome.test.tsx` (light unit tests)
- Modify: `packages/tui/src/components/views/dashboard.tsx`
- Modify: `packages/tui/src/components/views/workers-overview.tsx` (header / card panel)

- [x] **Step 1: Implement ViewHeader**

```tsx
/** @jsxImportSource @opentui/react */
import { Colors } from "@hoox-sh/hoox-shared";
import type { ReactNode } from "react";

export interface ViewHeaderProps {
  title: string;
  /** Right-aligned meta (counts, status) — must be string or text nodes per OpenTUI rules */
  meta?: ReactNode;
  showDivider?: boolean;
}

export function ViewHeader({
  title,
  meta,
  showDivider = true,
}: ViewHeaderProps) {
  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <text fg={Colors.accent} bold>
          {title}
        </text>
        {meta ? (
          <box flexDirection="row" gap={1}>
            {meta}
          </box>
        ) : null}
      </box>
      {showDivider ? (
        <text fg={Colors.border} dim>
          {"─".repeat(40)}
        </text>
      ) : null}
    </box>
  );
}
```

- [x] **Step 2: Implement Panel**

```tsx
/** @jsxImportSource @opentui/react */
import { Colors } from "@hoox-sh/hoox-shared";
import type { ReactNode } from "react";

export interface PanelProps {
  title?: string;
  focused?: boolean;
  elevated?: boolean;
  compact?: boolean;
  width?: number | string;
  flexGrow?: number;
  children?: ReactNode;
}

export function Panel({
  title,
  focused = false,
  elevated = true,
  compact = false,
  width,
  flexGrow,
  children,
}: PanelProps) {
  return (
    <box
      flexDirection="column"
      width={width}
      flexGrow={flexGrow}
      padding={compact ? 0 : 1}
      border={true}
      borderStyle="single"
      borderColor={focused ? Colors.accent : Colors.border}
      backgroundColor={elevated || focused ? Colors.card : undefined}
      title={title}
    >
      {children}
    </box>
  );
}
```

- [x] **Step 3: Minimal chrome tests**

```ts
import { describe, it, expect } from "bun:test";
import { ViewHeader } from "./view-header";
import { Panel } from "./panel";

describe("chrome", () => {
  it("exports ViewHeader and Panel", () => {
    expect(typeof ViewHeader).toBe("function");
    expect(typeof Panel).toBe("function");
  });
});
```

- [x] **Step 4: Adopt in dashboard**

In `dashboard.tsx`, replace the ad-hoc title row inside `DashboardHeader` (or wrap the header section) with `ViewHeader title="DASHBOARD" meta={...}`. Keep existing actions (refresh / auto-repair) as `meta` or as siblings under the header — do not remove keyboard handlers.

Prefer:

```tsx
import { ViewHeader } from "../shared/view-header";

// inside DashboardHeader return:
<box flexDirection="column" gap={0}>
  <ViewHeader
    title="DASHBOARD"
    meta={<>{/* existing status / actions as text nodes */}</>}
  />
</box>;
```

If OpenTUI forbids fragments with nested text incorrectly, use a row `box` of sibling `text` nodes only.

- [x] **Step 5: Adopt Panel in workers-overview**

Where worker cards already use border + focused accent, wrap content in `<Panel focused={focused} title={...}>` **or** replace the outer `box` props to match `Panel` defaults without double borders. Goal: same visual DNA, one shared component.

- [x] **Step 6: Run dashboard + workers tests**

```bash
cd /home/jango/Git/hoox-setup/packages/tui && bun test --preload ./src/test-setup.ts \
  src/components/shared/chrome.test.tsx \
  src/components/views/dashboard.test.tsx \
  src/components/views/workers-overview.test.tsx
```

Expected: pass.

- [x] **Step 7: Commit**

```bash
git add packages/tui/src/components/shared/view-header.tsx \
  packages/tui/src/components/shared/panel.tsx \
  packages/tui/src/components/shared/chrome.test.tsx \
  packages/tui/src/components/views/dashboard.tsx \
  packages/tui/src/components/views/workers-overview.tsx
git commit -m "feat(tui): add ViewHeader/Panel chrome and adopt in core views"
```

---

### Task 6: Quit modal extract + residual polish

**Files:**

- Create: `packages/tui/src/components/shared/quit-modal.tsx`
- Modify: `packages/tui/src/app.tsx`
- Modify: `docs/devops/tui.mdx` (short note on registry + status colors)
- Grep residual hex

- [x] **Step 1: Extract QuitModal**

```tsx
/** @jsxImportSource @opentui/react */
import { Colors } from "@hoox-sh/hoox-shared";

export interface QuitModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function QuitModal({
  title,
  message,
  onConfirm,
  onCancel,
}: QuitModalProps) {
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      backgroundColor={Colors.background}
    >
      <box
        flexDirection="column"
        gap={1}
        padding={2}
        border={true}
        borderStyle="double"
        borderColor={Colors.accent}
        backgroundColor={Colors.card}
        minWidth={40}
      >
        <text fg={Colors.accent} bold>
          {title}
        </text>
        <text fg={Colors.foreground}>{message}</text>
        <box flexDirection="row" gap={2} paddingTop={1}>
          <text fg={Colors.error} bold onMouseUp={onConfirm}>
            [Y/Enter] Quit
          </text>
          <text fg={Colors.muted} onMouseUp={onCancel}>
            [N/Esc] Cancel
          </text>
        </box>
      </box>
    </box>
  );
}
```

- [x] **Step 2: Use in app.tsx**

```tsx
import { QuitModal } from "./components/shared/quit-modal";

{
  modal?.type === "confirm" && modal.title === "Quit HOOX?" && (
    <QuitModal
      title={modal.title}
      message={modal.message ?? "Exit the terminal operations center."}
      onConfirm={() => {
        dismissModal();
        quitApp();
      }}
      onCancel={() => dismissModal()}
    />
  );
}
```

- [x] **Step 3: Docs note in `docs/devops/tui.mdx`**

After directory map section, add:

```md
### Navigation registry & colors

- View factories, sidebar labels, keyboard shortcuts, and palette **view** commands are defined in `packages/tui/src/view-registry.ts`.
- Semantic status colors (`ConnectionStatusColor`, `WorkerStatusColor`, `LogLevelColor`, `AlertSeverityColor`) live in `@hoox-sh/hoox-shared` (`packages/shared/src/colors.ts`). Do not invent local status→hex maps in views.
```

- [x] **Step 4: Final hex sweep (production)**

```bash
cd /home/jango/Git/hoox-setup && rg -n '#[0-9A-Fa-f]{6}' packages/tui/src --glob '!**/*.{test.ts,test.tsx}' --glob '!**/colors.test.ts'
```

Expected: no brand hex outside comments; any remaining must be justified and moved to `Colors`.

- [x] **Step 5: Full TUI verification**

```bash
cd /home/jango/Git/hoox-setup/packages/tui && bun run typecheck && bun test --preload ./src/test-setup.ts
```

Expected: typecheck exit 0; all tests pass (skip e2e if no TTY — existing smoke behavior).

- [x] **Step 6: Commit**

```bash
git add packages/tui/src/components/shared/quit-modal.tsx packages/tui/src/app.tsx \
  docs/devops/tui.mdx
git commit -m "refactor(tui): extract quit modal and document registry/color maps"
```

---

### Task 7: Final acceptance gate

- [x] **Step 1: Acceptance checklist (from spec)**

Verify each:

1. No hard-coded brand hex in production TUI sources except via `Colors`.
2. Connection / worker / log / alert colors from shared maps only.
3. One registry drives nav labels, shortcuts, palette views, factories; all `ViewId`s covered.
4. `ViewHeader` / `Panel` used in dashboard + workers-overview.
5. `colors.test.ts` imports shared tokens.
6. `bun run typecheck` + `bun test --preload ./src/test-setup.ts` in `packages/tui` pass.
7. Light theme not partially implemented.

- [x] **Step 2: Optional smoke**

If interactive TTY available:

```bash
cd /home/jango/Git/hoox-setup/packages/tui && bun run dev
```

Manually: Ctrl+1, Ctrl+B, Ctrl+P, Ctrl+Alt+K, status bar colors offline vs connected if possible.

- [x] **Step 3: Done**

No further code unless checklist fails.

---

## Self-review (plan vs spec)

| Spec section                | Task coverage                                    |
| --------------------------- | ------------------------------------------------ |
| Goals / non-goals           | Tasks 1–7; light theme & monster splits excluded |
| Color DNA + maps + backdrop | Task 1–3                                         |
| Hard-coded hex cleanup      | Task 3, 6                                        |
| colors.test shared import   | Task 2                                           |
| View registry               | Task 4                                           |
| ViewHeader / Panel          | Task 5                                           |
| Quit modal                  | Task 6                                           |
| Docs note                   | Task 6                                           |
| Acceptance + verify         | Task 7                                           |

No TBD placeholders. API names consistent: `ConnectionStatusColor`, `WorkerStatusColor`, `LogLevelColor`, `AlertSeverityColor`, `getSidebarItems`, `getViewShortcutMap`, `getCtrlAltViewMap`, `getViewFactory`, `ALL_PALETTE_COMMANDS`.
