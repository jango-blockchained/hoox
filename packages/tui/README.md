# Hoox TUI

**Terminal Operations Center** for the Hoox algorithmic trading framework.  
A full-screen terminal dashboard built with [OpenTUI](https://github.com/anomalyco/opentui), [Bun](https://bun.sh), and [Zustand](https://zustand.docs.pmnd.rs/).

---

## Quick Start

### Outside a monorepo (recommended for operators)

```bash
# CLI + TUI as global packages
bun add -g @jango-blockchained/hoox-cli @jango-blockchained/hoox-tui
# or after CLI is already installed:
bun add -g @jango-blockchained/hoox-tui

hx tui
```

If the TUI package is missing, `hx tui` prints install instructions.  
Full monorepo under `~/.hoox/repo` is optional (`hx doctor --fix-runtime`).

### From this monorepo

```bash
# Install dependencies (from repo root)
bun install

# Launch via CLI (recommended) — LOCAL → http://localhost:8787
hoox tui

# Connect to remote management plane (REMOTE) — fail-closed auth
# Server secret: wrangler secret put OPERATOR_API_KEY  (must match token)
export HOOX_API_TOKEN=…   # required (or Access service-token env)
# Optional Access: CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET
# Optional: HOOX_TRANSPORT=access
hoox tui --remote
# or: hoox tui --api-url https://mgmt.example.com --token "$HOOX_API_TOKEN"
# Escape hatch only: hoox tui --remote --allow-insecure
# Management API: GET /v1/health, /v1/workers, SSE /v1/trades|logs/stream

# Dev logging → $HOME/.hoox/.tui-state/debug.log (secrets redacted)
hoox tui --debug
# or: HOOX_DEBUG=1 / TUI_DEBUG=1

# Or launch from package
cd packages/tui
bun run dev

# Build bundle
bun run build

# Run the built bundle
bun run start
```

**Prerequisites:**

- [Bun](https://bun.sh) >= 1.2
- Terminal with 256-color support (xterm-256color, kitty, iTerm2, Windows Terminal)
- Minimum terminal size: 80 columns × 24 rows
- OpenTUI packages (`@opentui/core`, `@opentui/react`) — installed via `bun install`

Persistent UI state lives under `$HOME/.hoox/.tui-state/` (session, crash log, chat history, DB query history).

---

## Keyboard Shortcuts

| Key                 | Action                                   |
| ------------------- | ---------------------------------------- |
| `Ctrl+1`            | Dashboard view                           |
| `Ctrl+2`            | Workers Overview                         |
| `Ctrl+3`            | Worker Detail                            |
| `Ctrl+4`            | Trade Monitor                            |
| `Ctrl+5`            | Logs Viewer                              |
| `Ctrl+6`            | Service Manager                          |
| `Ctrl+7`            | Config Editor                            |
| `Ctrl+8`            | Setup Wizard                             |
| `Ctrl+9`            | Settings                                 |
| `Ctrl+0`            | Queue Depth                              |
| `Ctrl+Alt+K`        | KV Viewer                                |
| `Ctrl+Alt+S`        | Secrets Viewer                           |
| `Ctrl+Alt+C`        | AI Chat                                  |
| `Ctrl+Alt+Q`        | DB Query                                 |
| `Ctrl+Alt+E`        | Edge Topology                            |
| `Ctrl+P`            | Open Command Palette                     |
| `Ctrl+B`            | Toggle Sidebar                           |
| `Ctrl+R`            | Refresh all data                         |
| `Ctrl+Q`            | Quit (with confirmation)                 |
| `Esc`               | Close palette / dismiss modal / go back  |
| `↑` `↓`             | Navigate within active view              |
| `Tab` / `Shift+Tab` | Cycle focus between interactive elements |
| `Enter`             | Select / confirm                         |
| `Space`             | Toggle                                   |
| `/`                 | Focus search (in searchable views)       |

---

## Views

| View                 | Description                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **Dashboard**        | System health overview with service grid, recent alerts, and quick stats (P&L, trades, AI calls). |
| **Workers Overview** | List of all Cloudflare Workers with status, uptime, CPU, memory, and request metrics.             |
| **Worker Detail**    | Detailed view of a single worker — logs, metrics, Durable Objects, and deployment info.           |
| **Trade Monitor**    | Live trade stream with symbol, side, price, quantity, and P&L per trade.                          |
| **Logs Viewer**      | Scrollable log stream with level filtering, worker selection, and full-text search.               |
| **Service Manager**  | Start, stop, restart, and deploy workers. View deployment history and rollback.                   |
| **Config Editor**    | Edit Hoox configuration — exchange credentials, strategy parameters, risk limits.                 |
| **Setup Wizard**     | Step-by-step guided setup for new Hoox installations (API keys, exchanges, wallet).               |
| **Settings**         | Display preferences, theme, notification toggles, and keyboard shortcut customization.            |
| **Queue Depth**      | Queue backlog visualization across workers.                                                       |
| **KV Viewer**        | Read-only Cloudflare KV key browser.                                                              |
| **Secrets Viewer**   | Read-only secret names/metadata (values never shown).                                             |
| **AI Chat**          | Streaming chat with the agent worker.                                                             |
| **DB Query**         | Read-only D1 SQL panel (`SELECT` / `WITH` / `EXPLAIN` only).                                      |
| **Edge Topology**    | Worker mesh / service-binding graph.                                                              |

---

## Tech Stack

| Component            | Technology                                                                              |
| -------------------- | --------------------------------------------------------------------------------------- |
| **TUI Framework**    | OpenTUI — `@opentui/core` + `@opentui/react` (JSX-based terminal rendering)             |
| **Runtime**          | [Bun](https://bun.sh) — fast all-in-one JS runtime                                      |
| **State Management** | [Zustand](https://zustand.docs.pmnd.rs/) with Immer middleware                          |
| **Language**         | TypeScript (strict mode)                                                                |
| **Testing**          | Bun test runner (`bun test`)                                                            |
| **Build**            | `bun build` — bundles entry to `dist/main.js` (OpenTUI packages external)               |
| **Shared Module**    | `@jango-blockchained/hoox-shared` — API client, SSE streaming, color tokens, formatters |

---

## Running Tests

```bash
# From package
cd packages/tui
bun test

# From monorepo root (recommended)
bun run test:tui

# Typecheck
bun run typecheck

# E2E smoke (requires interactive TTY + OpenTUI)
bun test test/e2e/
```

---

## Troubleshooting

### "Cannot find module @opentui/core"

OpenTUI packages must be installed. Ensure `bun install` completed successfully.  
If the packages are in a local path, verify the workspace configuration in the root `package.json`.

### API unreachable (OFFLINE in status bar)

The TUI tries HTTP first, then falls back to the `hoox` CLI. Check:

1. Is a local dev mesh / API reachable? (`HOOX_API_URL`, default `http://localhost:8787`)
2. Is the `hoox` CLI on `PATH`? (`bun add -g @jango-blockchained/hoox-cli`)
3. Are you on the correct network / VPN?

### Terminal too small

The TUI requires at least **80 columns × 24 rows**. Resize your terminal window.  
If you see garbled output, try: `export TERM=xterm-256color`

### Garbled screen after exit

If the alternate screen buffer isn't cleaned up, run: `reset` or `tput reset`

### Ctrl+Q not working

Some terminal emulators intercept Ctrl+Q for flow control (XON/XOFF).  
Disable flow control in your terminal settings, or use `stty -ixon` before launching.  
You can also open the command palette (`Ctrl+P`) and run **QUIT HOOX**.

### Build fails with missing dependencies

The `bun build` command bundles TypeScript sources with OpenTUI marked external. If dependencies aren't resolved:

```bash
bun install
bun run build
```

Ensure `@jango-blockchained/hoox-shared` is linked as a workspace dependency.

### Colors look wrong

The TUI uses 256-color ANSI escape sequences. Ensure:

- `TERM=xterm-256color` (or `kitty`, `screen-256color`)
- Your terminal supports 256 colors
- No conflicting terminal color schemes

---

## Project Structure

```
packages/tui/
├── src/
│   ├── main.tsx                   # Entry point — OpenTUI renderer setup
│   ├── app.tsx                    # Root component — layout, keyboard, crash recovery
│   ├── components/
│   │   ├── views/                 # Dashboard, workers, trades, logs, queues, …
│   │   ├── layout/                # Sidebar + status bar
│   │   ├── shared/                # Palette, crash screen, error boundary, …
│   │   └── ui/                    # Dialog / toast wrappers
│   ├── services/
│   │   ├── cli-bridge/            # Spawns `hoox` CLI with typed results
│   │   ├── hoox-path-service.ts   # $HOME/.hoox path helpers
│   │   └── tui-storage.ts         # File-backed JSON state (no localStorage)
│   ├── hooks/                     # Keyboard, polling, renderer ref
│   └── stores/                    # Store unit tests (stores live in hoox-shared)
├── test/
│   ├── e2e/smoke.test.ts
│   └── integration/navigation.test.tsx
├── package.json
└── README.md
```

---

## Design

Near-black canvas (`#050508`), cool indigo accent (`#818CF8`) + cyan highlight,
animated cool brackets on chrome (cyan→indigo→violet), squared edges.
Follows the Hoox landing page design DNA. No CSS, no DOM — pure terminal rendering via OpenTUI's JSX intrinsics (`<box>`, `<text>`, `<input>`, `<scrollbox>`). UI persistence uses the filesystem under `$HOME/.hoox/.tui-state/` (Bun has no `localStorage`).
