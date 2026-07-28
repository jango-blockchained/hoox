<!--
  Copyright (c) 2026 HOOX · jango-blockchained
  SPDX-License-Identifier: CC-BY-4.0
-->

# TUI Balanced Quality Pass — Design Spec

**Date:** 2026-07-20  
**Package:** `packages/tui` (+ minimal `packages/shared` token/map exports)  
**Approach:** B — Balanced quality pass (conservative color DNA)  
**Status:** Approved in brainstorming; pending implementation plan

---

## 1. Goals and non-goals

### Goals

1. **Unify color usage** around the existing Hoox design DNA (`#0D1117` background, `#E8780A` accent).
2. **Centralize semantic color maps** (connection, worker status, log level, alert severity) so status chrome cannot drift.
3. **Single view registry** driving sidebar labels/shortcuts, keyboard shortcuts, command palette entries, and view factories.
4. **Shared view chrome** (`ViewHeader`, `Panel`) for consistent titles, borders, padding, and focus affordances.
5. **Fix hard-coded hex** in entry/shell paths; tests import real tokens, not mirrored copies.
6. **Polish contrast and hierarchy** conservatively (e.g. log `debug` uses `muted`, not near-invisible `dim`).
7. **Keep changes verifiable** via existing unit/integration tests + typecheck; no silent regressions.

### Non-goals

- Implementing a real **light theme** (config may keep the field; UI stays dark tokens).
- Full decomposition of **settings**, **setup-wizard**, **service-manager**, or **trade-monitor** bodies.
- New views, new features, or OpenTUI major upgrades.
- Full **cli-bridge** rewrite.
- Rewriting SSE/store data flows beyond what chrome/registry needs.

---

## 2. Color system

### Brand DNA (unchanged)

| Token                  | Hex       | Role                                              |
| ---------------------- | --------- | ------------------------------------------------- |
| `background`           | `#0D1117` | Full-screen / root                                |
| `card` / `panel`       | `#1C1C1F` | Elevated surfaces                                 |
| `border` / `divider`   | `#484848` | Borders                                           |
| `foreground` / `text`  | `#EEEEEE` | Primary text                                      |
| `muted` / `text-muted` | `#A0A0A0` | Secondary text                                    |
| `muted-foreground`     | `#6E6E6E` | Tertiary labels / chrome hints                    |
| `dim`                  | `#3B3B3D` | Non-text decoration only (rules, inactive glyphs) |
| `accent` / `highlight` | `#E8780A` | Brand emphasis, active nav, primary actions       |
| `accent-dim`           | `#B85E08` | Secondary accent                                  |
| `success`              | `#00FF88` | Operational / connected                           |
| `warning`              | `#FFAA00` | Degraded / reconnecting                           |
| `error`                | `#FF4444` | Down / offline / failure                          |
| `info`                 | `#4488FF` | Informational / view-category                     |
| `backdrop`             | `#000000` | Dialog/overlay dim only (new)                     |

### Hard-coded hex cleanup

| Location                                          | Today                   | Target                                                                                        |
| ------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `packages/tui/src/main.tsx` `backgroundColor`     | `"#0D1117"`             | `Colors.background`                                                                           |
| `packages/tui/src/app.tsx` dialog `backdropColor` | `"#000000"`             | `Colors.backdrop` (`#000000`) — new token for overlay dimming only; never scatter the literal |
| View/components                                   | mostly `Colors.*`       | Keep; replace any remaining literals found during pass                                        |
| `packages/tui/src/utils/colors.test.ts`           | Local mirror of palette | Import `Colors` (and new maps) from `@jango-blockchained/hoox-shared`                         |

### Semantic maps (new single source)

Add semantic maps in `packages/shared/src/colors.ts` and re-export from `packages/shared/src/index.ts`:

```ts
export const ConnectionStatusColor = {
  connected: Colors.success,
  polling: Colors.accent,
  reconnecting: Colors.warning,
  offline: Colors.error,
} as const;

export const WorkerStatusColor = {
  operational: Colors.success,
  degraded: Colors.warning,
  down: Colors.error,
} as const;

export const LogLevelColor = {
  error: Colors.error,
  warn: Colors.warning,
  info: Colors.foreground,
  debug: Colors.muted, // not dim — readable on background
} as const;

export const AlertSeverityColor = {
  info: Colors.info,
  warning: Colors.warning,
  error: Colors.error,
  critical: Colors.error,
} as const;
```

**Consumers that must switch to these maps:**

- `components/layout/statusbar.tsx`
- `components/shared/status-dot.tsx`
- `components/views/logs-viewer.tsx` (and any other view-local `LEVEL_FG` / status maps)
- Shared tests under `packages/tui/src/utils/colors.test.ts` and related shared component tests

**Rule:** No new local hex or ad-hoc status→color tables in views. If a new status domain appears, extend shared maps.

### Explicitly deferred

- Light theme token set and runtime theme switching.
- Softening neon success green (DNA-preserving pass only).

---

## 3. Architecture

### 3.1 Single view registry

**New module:** `packages/tui/src/view-registry.ts` (fixed path).

Each entry:

| Field        | Purpose                                               |
| ------------ | ----------------------------------------------------- |
| `id: ViewId` | Canonical id (shared types)                           |
| `label`      | Command palette / long name                           |
| `shortLabel` | Sidebar text                                          |
| `shortcut`   | Human-readable hint (`"1"`, `"^K"`, …)                |
| `key`        | Machine key for Ctrl+digit or Ctrl+Alt+letter binding |
| `keyMod`     | `"ctrl"` (digit views) or `"ctrl-alt"` (chord views)  |
| `aliases`    | Palette search aliases                                |
| `factory`    | `(dialog: DialogHandle) => React.ReactNode`           |

Palette **action** commands (refresh, toggle-sidebar, quit) live in the same file as a separate `ACTION_COMMANDS` array (not mixed into `ViewId` exhaustiveness).

Derived pure helpers:

- `getSidebarItems()` — ordered short labels + shortcut hints
- `getViewShortcutMap()` — keyboard routing for Ctrl+digit
- `getCtrlAltViewMap()` — keyboard routing for Ctrl+Alt+letter
- `getViewPaletteCommands()` — view entries for the command palette
- `getViewFactory(id)` / `VIEWS` record — full `Record<ViewId, ViewFactory>`

**Order** must match today’s product order (dashboard → … → edge-topology).

**Sources of truth today (to delete after migration):**

- `Sidebar` local `items` array
- `app.tsx` `VIEWS`, `VIEW_SHORTCUTS`, view portion of `PALETTE_COMMANDS`

### 3.2 Shared chrome components

**New (or under `components/shared/`):**

1. **`ViewHeader`**
   - Title (accent, bold)
   - Optional right-side meta (counts, status line)
   - Optional bottom divider using `Colors.border` / dim rule — consistent across views

2. **`Panel`**
   - Props: `title?`, `flexGrow?`, `width?`, `focused?`, `elevated?` (default true), `children`
   - Defaults: single border; `borderColor` = focused ? accent : border; `backgroundColor` = card when `elevated` or focused
   - Standard padding `1` (`compact` prop uses `0` padding)

Adoption strategy: use in **shell-adjacent and high-traffic views** first (dashboard header, workers-overview cards where it fits, logs filter panel if natural). Do **not** force a mechanical rewrite of every line in settings/setup-wizard; prefer opportunistic adoption where a header/panel already exists.

### 3.3 App shell thinning

`app.tsx` responsibilities after pass:

- Session restore / save
- Startup data load + SSE kickoff
- CLI error sink
- Global keyboard (driven by registry helpers)
- Layout: Sidebar | content | StatusBar | palette | quit overlay
- Crash recovery wrapper

Extract:

- Quit confirmation overlay → `components/shared/quit-modal.tsx` (required; keeps shell readable after registry extract)
- Palette action dispatch stays in app (thin switch)

**Do not** move crash recovery off the critical path.

### 3.4 Sidebar polish

- Items and shortcuts entirely from registry
- Active: accent + `▸`; inactive: foreground/muted as today
- Footer hint reflects real bindings (“Ctrl+0-9 · Ctrl+Alt+…”) without claiming keys that only work as Ctrl+Alt chords incorrectly

---

## 4. UX polish details

| Item                    | Spec                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root background         | Always `Colors.background`                                                                                                                                                  |
| Status bar pills        | `ConnectionStatusColor[status]`                                                                                                                                             |
| Status dots             | `WorkerStatusColor` (or shared status-dot map built from it)                                                                                                                |
| Log levels              | `LogLevelColor`; debug readable                                                                                                                                             |
| Palette category badges | Keep info/accent/warning mapping; ideally reference `Colors` only                                                                                                           |
| Error boundary / crash  | Unchanged behavior; continue using design tokens                                                                                                                            |
| Quit modal              | Unchanged UX; token-only styling                                                                                                                                            |
| Theme setting UI        | May still show dark/light control; **does not** recolor TUI in this pass (document in Settings copy if easy; else leave behavior as-is with no false claims in new strings) |

---

## 5. Error handling and safety

- Per-view `ErrorBoundary` remains mandatory for primary views.
- Crash recovery process handlers unchanged in semantics.
- Registry must cover **all** `ViewId` values (compile-time exhaustiveness via `Record<ViewId, …>` or `satisfies`).
- No change to CLI bridge error types; status bar continues to consume `lastErrorDetails`.

---

## 6. Testing and verification

### Must pass

```bash
cd packages/tui && bun run typecheck
cd packages/tui && bun test --preload ./src/test-setup.ts
# or monorepo:
bun run test:tui
```

### Test updates

| Test                         | Change                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `utils/colors.test.ts`       | Import shared `Colors` + semantic maps; keep contrast/DNA assertions; debug log color asserts `Colors.muted` |
| `shared/shared.test.tsx`     | StatusDot / palette colors from shared maps if assertions hard-code hex                                      |
| `layout/*` tests             | Still pass; update only if statusbar map shape changes                                                       |
| New: `view-registry.test.ts` | Every `ViewId` present; unique shortcuts; palette ids match; factories defined                               |

### Out of scope for this pass

- Expanding E2E smoke beyond existing smoke suite
- Visual screenshot regression (no framework in repo)

---

## 7. File plan (implementation sketch)

| Action       | Path                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Extend       | `packages/shared/src/colors.ts` (+ export from `index.ts`)                                                                             |
| Add          | `packages/tui/src/view-registry.ts`                                                                                                    |
| Add          | `packages/tui/src/components/shared/view-header.tsx`                                                                                   |
| Add          | `packages/tui/src/components/shared/panel.tsx`                                                                                         |
| Add          | `packages/tui/src/components/shared/quit-modal.tsx`                                                                                    |
| Edit         | `packages/tui/src/main.tsx`, `app.tsx`, `sidebar.tsx`, `statusbar.tsx`, `status-dot.tsx`, `logs-viewer.tsx`, other local maps as found |
| Edit         | `packages/tui/src/utils/colors.test.ts`, related tests                                                                                 |
| Add          | `packages/tui/src/view-registry.test.ts` (or under `components/`)                                                                      |
| Docs (light) | Optional one-line note in `docs/devops/tui.mdx` about registry + status color maps                                                     |

---

## 8. Implementation phases

1. **Shared tokens & maps** — extend `colors.ts`, export, fix shared consumers’ types if any.
2. **TUI color consumers + tests** — statusbar, status-dot, logs, main background, colors tests green.
3. **View registry** — extract, wire sidebar + app + palette; registry tests.
4. **Chrome components** — ViewHeader/Panel; adopt in 2–4 high-traffic views.
5. **Shell polish** — quit modal extract if needed; sidebar hints; residual hard-coded hex sweep.
6. **Verify** — typecheck + full TUI test suite; fix regressions.

---

## 9. Acceptance criteria

- [ ] No hard-coded brand hex in production TUI sources except via `Colors` / documented backdrop token.
- [ ] Connection, worker, log level, and alert severity colors come from shared maps only.
- [ ] One registry drives navigation labels, shortcuts, palette view entries, and factories; TypeScript enforces full `ViewId` coverage.
- [ ] `ViewHeader` / `Panel` exist and are used in at least dashboard + one list/detail view without visual regressions against design DNA.
- [ ] `colors.test.ts` imports shared tokens (no dual source of truth).
- [ ] `bun run typecheck` (tui) and `bun test` (tui preload) pass.
- [ ] Light theme remains out of scope (no partial broken light palette).

---

## 10. Risks and mitigations

| Risk                                          | Mitigation                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Registry key mismatch breaks Ctrl+N shortcuts | Unit tests for shortcut map; manual smoke of Ctrl+1 and one Ctrl+Alt chord   |
| Panel adoption changes layout in dense views  | Adopt conservatively; match existing border/padding numbers                  |
| Shared package export breaks other consumers  | Additive exports only; no rename of existing `Colors` keys                   |
| Large `app.tsx` merge conflicts               | Keep registry extract as pure move; minimal behavior change in same PR slice |

---

## 11. Decisions log

| Decision             | Choice                              |
| -------------------- | ----------------------------------- |
| Approach             | B — balanced quality pass           |
| Color aggressiveness | Conservative DNA preserve           |
| Light theme          | Explicit non-goal                   |
| Monster view splits  | Explicit non-goal                   |
| Debug log color      | `Colors.muted` via `LogLevelColor`  |
| Backdrop black       | `Colors.backdrop = "#000000"`       |
| Registry path        | `packages/tui/src/view-registry.ts` |
| Quit modal extract   | Required (`quit-modal.tsx`)         |
