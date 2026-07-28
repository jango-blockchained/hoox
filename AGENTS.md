# Agent Instructions

## Ecosystem & websites

| Product | GitHub | Website |
|---------|--------|---------|
| **HOOX** (this repo) | [jango-blockchained/hoox](https://github.com/jango-blockchained/hoox) | [hoox.sh](https://hoox.sh) · [docs.hoox.sh](https://docs.hoox.sh) |
| **PYNE** | [jango-blockchained/pyne](https://github.com/jango-blockchained/pyne) | [hoox.sh/pyne](https://hoox.sh/pyne) · [docs](https://hoox.sh/pyne/docs) |
| **AXIS** | [jango-blockchained/axis](https://github.com/jango-blockchained/axis) | [hoox.sh/axis](https://hoox.sh/axis) · [docs](https://hoox.sh/axis/docs) |

Local clones often sit next to each other: `/home/jango/Git/{hoox,pynescript,axis}`.

## First-Time Setup

```bash
git clone --recursive https://github.com/jango-blockchained/hoox.git
bun install
```

9 workers (`workers/*`, except `workers/dashboard`) are Git submodules — without `--recursive` they are empty directories. The 10th directory (`workers/dashboard`) is a Next.js app living in the parent repo.

## Monorepo

Bun workspaces: `packages/*`, `workers/*`, `pages/*`.

| Workspace | Purpose | Entry Point |
|---|---|---|
| `packages/cli` | CLI tool (`hoox` commands) | `bin/hoox.js` |
| `packages/shared` | Shared middleware, types, errors, analytics, D1 schemas | `src/index.ts` (exports: `./middleware`, `./d1`, `./schemas`, `./wizard`, `./stores/*`) |
| `packages/tui` | OpenTUI terminal dashboard | `src/main.tsx` |
| `workers/hoox-worker` | Gateway (webhook entry point, public) | `src/index.ts` |
| `workers/trade-worker` | Multi-exchange execution | `src/index.ts` |
| `workers/agent-worker` | AI risk manager (5min cron) | `src/index.ts` |
| `workers/d1-worker` | D1 database operations | `src/index.ts` |
| `workers/telegram-worker` | Notifications | `src/index.ts` |
| `workers/web3-wallet-worker` | DeFi/on-chain execution | `src/index.ts` |
| `workers/email-worker` | Email signal parsing | `src/index.ts` |
| `workers/analytics-worker` | Analytics & reporting | `src/index.ts` |
| `workers/report-worker` | PDF reports (Browser Rendering) | `src/index.ts` |
| `workers/dashboard` | Next.js 16 + OpenNext on Cloudflare Workers | `src/index.tsx` |
| `pages/docs` | Astro docs site | — |

> Dashboard lives at `workers/dashboard/` (NOT `pages/dashboard` — that path is legacy).

## Commands

```bash
bun install              # install (never npm/yarn)
bun test                 # all unit tests (bun native runner, 60s timeout, coverage on)
bun test packages/cli/   # focused: CLI tests
bun test packages/shared/ # focused: shared package
bun test packages/tui/   # TUI tests (preloads test-setup.ts)
bun test workers/hoox-worker/   # focused: single worker
bun test tests/integration/  # integration tests (vitest)
bun test tests/live/ --jobs 1 # live tests (needs Cloudflare creds)
bun test tests/security/ # security tests
bun test tests/e2e/      # end-to-end tests
bun test:load             # k6 load test suite (4 scripts)
bun test:all              # lint → typecheck → unit → live
bun run lint              # ESLint (flat config)
bun run lint:fix          # ESLint + auto-fix
bun run typecheck         # multi-project tsc via scripts/typecheck-all.ts
bun run build             # build:packages + typecheck
bun run format            # Prettier
bun run graph             # regenerate graph.json (~25s, scripts/extract-graph.ts)
hoox tui                  # launch TUI dashboard
hoox workers deploy       # deploy all workers
hoox pages deploy         # deploy dashboard (Cloudflare Workers via OpenNext)
hoox secrets update-cf    # push secrets to Cloudflare
bunx wrangler tail <name> # live worker logs
```

## CI Pipeline

`bun run lint` → `bun run typecheck` → `bun test` → `bun run build` (sequential jobs, CI runs all).

## Pre-Commit / Pre-Push

- **Pre-commit**: `npx lint-staged` (eslint --fix + prettier --write on staged `*.{ts,tsx,js,jsx,mjs,cjs,json,yaml,yml,md,css,scss}`)
- **Pre-push**: `bun run typecheck`

## Testing

- **Unit**: `bun test` (bun native runner), config in `bunfig.toml` — coverage always on, 60s timeout, NODE_ENV=test
- **Integration**: `vitest` + `@cloudflare/vitest-pool-workers` (config: vitest.config.ts)
- **Live**: `bun test tests/live/ --jobs 1` (requires Cloudflare credentials)
- **Coverage threshold**: 80%
- Test files live across all workers, `packages/shared`, `packages/cli`
- ESLint relaxes rules in test files (`no-unused-vars`: warn, `no-explicit-any`: warn, `ban-ts-comment`: warn)

## Local Development

```bash
hoox dev start                # interactive (Native vs Docker)
hoox dev start --runtime native   # force wrangler dev
hoox dev start --runtime docker   # force docker compose
hoox dev worker <name>        # single worker via wrangler dev
hoox dev dashboard            # Next.js dev server
```

Runtime preference saved to `wrangler.jsonc.dev.runtime` (not re-prompted).

Docker Compose profiles: `workers`, `dashboard`, `full` (workers + dashboard).

```bash
docker compose --profile workers up
docker compose --profile workers --profile dashboard up
```

Self-hosted production server: `bun run server.js` (Bun.serve, maps path prefixes to worker modules, requires `HOOX_SERVER_API_KEY`).

## Dashboard (workers/dashboard)

- Next.js 16 + Turbopack, `@opennextjs/cloudflare` adapter (NOT `@cloudflare/next-on-pages`)
- Build: `bunx opennextjs-cloudflare build` → `.open-next/worker.js`
- Deploy: `bunx wrangler deploy` (Cloudflare Workers runtime, NOT Pages)
- Config: `wrangler.jsonc` with `main: ".open-next/worker.js"`, `assets.directory: ".open-next/assets"`
- Static assets via `ASSETS` binding
- Framer Motion components need `'use client'`
- Pages with `'use client'` cannot export `metadata` — use separate `metadata.ts`

## Architecture

10 workers communicating via Cloudflare Service Bindings (no public URLs). Gateway (`workers/hoox-worker`) and Dashboard are the only public-facing endpoints.

```
External Inputs → hoox (Gateway) → trade-worker → d1-worker → analytics-worker
                                  → agent-worker → trade-worker, telegram-worker
                                  → telegram-worker → analytics-worker
email-worker → trade-worker
web3-wallet-worker → telegram-worker
report-worker → telegram-worker
dashboard → d1-worker, agent-worker
```

**Infrastructure:** D1 (SQLite at edge), R2 (S3-compatible, zero-egress), KV (sub-ms config), DO (idempotency), Queues (async backpressure), Workers AI (5 providers), Vectorize (RAG), Analytics Engine, Browser Rendering.

**Smart Placement** enabled on trade, d1, telegram, web3-wallet, email, analytics (30-60% latency reduction).

## Edge / Worker Constraints

- No Node.js built-ins in workers — Edge runtime
- No hardcoded secrets — use `wrangler secret` or `hoox secrets`
- `wrangler types` generates `worker-configuration.d.ts` per worker
- `@cloudflare/workers-types` for type definitions
- `tsconfig.json`: strict mode, includes test files
- `tsconfig.prod.json`: strict (but `noImplicitAny: false`), excludes `*.test.*` and `test/` dirs
- Secrets in `wrangler.jsonc` `secrets` arrays; local dev secrets in `.dev.vars` (gitignored) per worker

## Code Graph

`graph.json` (2.5MB) — query only, never load fully. `graph-metadata.json` (44KB) — safe to load fully.

```bash
# Quick worker overview
bun -e "const g=require('./graph.json'); g.nodes.filter(n=>n.kind==='worker').forEach(w=>console.log(w.label,'| public:',w.isPublic,'| cron:',w.cron||'-','| eps:',w.entryPoint))"

# Get worker llmContext
bun -e "const g=require('./graph.json'); console.log(g.nodes.find(n=>n.id==='workspace:workers/hoox-worker').llmContext)"

# Infrastructure bindings for a worker
bun -e "const g=require('./graph.json'); g.edges.filter(e=>e.source==='workspace:workers/hoox-worker'&&e.kind==='infra-binding').forEach(e=>console.log(e.label,'→',g.nodes.find(n=>n.id===e.target)?.label))"

# All workers using a specific KV binding
bun -e "const b=require('./graph-metadata.json').infrastructure['kv:CONFIG_KV']; console.log(b.bindingName,'used by:',b.usedBy.join(', '))"
```

## Code Style Conventions

- **Prettier**: semi, `singleQuote: false`, `trailingComma: "es5"`, `printWidth: 80`, `tabWidth: 2`, `arrowParens: "always"`
- **ESLint**: flat config, TS strict, `no-undef: off` (CF worker types), `@typescript-eslint/ban-ts-comment: error`, `no-console: off`
- **TypeScript**: strict, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- Path alias: `@jango-blockchained/hoox-shared/*` → `packages/shared/src/*`
- `bun-types` + `node` types globally

## Sister Repos

Primary stack (websites on **[hoox.sh](https://hoox.sh)**):

| Product | GitHub | Local path | Website |
|---|---|---|---|
| **HOOX** (this repo) | [jango-blockchained/hoox](https://github.com/jango-blockchained/hoox) | `/home/jango/Git/hoox` | [hoox.sh](https://hoox.sh) · [docs.hoox.sh](https://docs.hoox.sh) |
| **PYNE** | [jango-blockchained/pyne](https://github.com/jango-blockchained/pyne) | `/home/jango/Git/pynescript` | [hoox.sh/pyne](https://hoox.sh/pyne) · [docs](https://hoox.sh/pyne/docs) |
| **AXIS** | [jango-blockchained/axis](https://github.com/jango-blockchained/axis) | `/home/jango/Git/axis` | [hoox.sh/axis](https://hoox.sh/axis) · [docs](https://hoox.sh/axis/docs) |

Related:

| Repo | Path | Purpose |
|---|---|---|
| `hoox-landing-page` | `/home/jango/Git/hoox-landing-page` | Marketing site source for [hoox.sh](https://hoox.sh) |
| `pyne-worker` | `/home/jango/Git/pyne-worker` | Python CF Worker — edge Pine eval |
| `pine-worker` | `/home/jango/Git/pine-worker` | TypeScript CF Worker — Pine eval + trade events |

**Key dependency links:**
- AXIS → pyne Pro API (`:5002`) or axis Worker for chart evaluation
- `pyne-worker` → `pynescript` package (editable install from pyne repo)
- `pine-worker` → `@jango-blockchained/hoox-shared` (this monorepo)
- All under `github.com/jango-blockchained/`

```
                    https://hoox.sh
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
         HOOX            PYNE           AXIS
    (this monorepo)  (Pine engine)  (charting UI)
           │              │              │
           └──────────────┴──────────────┘
```

## Important File Paths

| File | Purpose |
|---|---|
| `.opencode/` | Central agent knowledge hub (context, plans, specs, tasks, skills, sessions) |
| `.opencode/context/project-intelligence/` | Architecture, endpoints, bindings, errors, examples |
| `DESIGN.md` | Product & technical design (architecture, DDL, UI/UX rules) |
| `SKILL.md` | Hoox development agent skill (start here for any task) |
| `wrangler.jsonc` | Root worker config (global settings + shared infra wiring) |
| `workers/*/wrangler.jsonc` | Per-worker config |
| `graph.json` | Code graph (query only, 2.5MB) |
| `graph-metadata.json` | Semantic metadata (load fully, 44KB) |
| `server.js` | Self-hosted Bun production server |
