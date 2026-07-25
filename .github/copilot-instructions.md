# Copilot instructions for hoox-setup

Purpose: concise, actionable guidance for future Copilot CLI sessions working in this repository.

---

## Quick: build, test, lint commands

- Install dependencies (monorepo):
  - bun install

- Build / typecheck:
  - bun run build # packages + typecheck
  - bun run build:dashboard # dashboard only
  - bun run typecheck # multi-project tsc

- Lint / format:
  - bun run lint
  - bun run lint:fix
  - bun run format

- Tests:
  - bun test # all unit tests (bun native runner, coverage on)
  - bun run test:cli # CLI package
  - bun run test:workers # all workers
  - bun run test:integration # integration tests
  - bun run test:live --jobs 1 # live Cloudflare tests (needs credentials)

- Run a single test file (example):
  - bun test path/to/file.test.ts
  - Example from repo: bun test workers/trade-worker/src/index.test.ts --watch

- Additional:
  - hoox dev start # interactive local dev (choose runtime)
  - hoox workers deploy
  - bunx wrangler tail <name> # live worker logs

---

## High-level architecture (what Copilot should know)

- Monorepo managed with Bun workspaces: packages/_, workers/_, pages/\*.
- Key workspaces:
  - packages/cli — hoox CLI (bin/hoox.js)
  - packages/shared — shared middleware, D1 schemas, types
  - packages/tui — terminal UI
  - workers/\* — 10 Cloudflare Workers (gateway + domain-specific workers)
  - workers/dashboard — Next.js 16 + OpenNext worker (public)
- Communication: workers use Cloudflare Service Bindings (internal RPC); only `workers/hoox-worker` (gateway) and dashboard are public.
- Infra used: D1 (edge SQLite), R2, KV, Queues, Workers AI providers, Vectorize (RAG). Smart Placement enabled for latency-sensitive workers.
- Constraints: workers run on Edge runtime (no Node built-ins). Secrets managed via wrangler/hoox secrets and per-worker `.dev.vars` (gitignored).
- graph-metadata.json is the tracked semantic graph; regenerate full graph.json/graph.dot with `bun run graph` (not committed).

---

## Key repo-specific conventions and patterns

- Bun-first: always use Bun (bun install, bun run). Do not use npm/yarn.
- Worker submodules: `workers/*` are Git submodules — clone with `--recursive` or run `git submodule update --init --recursive`.
- Test harness: repository uses a custom test launcher (`scripts/test-with-table.ts`) — scripts in package.json wrap it; use package scripts (e.g., `bun run test:cli`) when possible.
- Single-test runs: use `bun test <path>` for an individual file. Use `--watch` for iterative debugging.
- TypeScript: strict settings; use `bun run typecheck` and `tsc -p tsconfig.prod.json --noEmit` for production checks.
- Linting/formatting: ESLint + Prettier; pre-commit hooks via Husky and lint-staged are configured (prepare/husky). Use `bun run lint` and `bun run lint:fix`.
- Path alias: `@jango-blockchained/hoox-shared/*` → packages/shared/src/\* — Copilot should prefer that import style when suggesting fixes.
- No hardcoded secrets: never commit `.env.local`, `.dev.vars`, or credentials. Use `hoox secrets update-cf` or `wrangler secret` for production/dev secrets.
- Tests preload: `packages/test-utils/src/setup.ts` is preloaded for many tests (see bunfig.toml preload).
- Dashboard specifics: Next.js 16 + OpenNext — build via `bunx opennextjs-cloudflare build` and deploy with `bunx wrangler deploy` (worker runtime).

---

## Files to consult (authoritative sources)

- README.md — developer & runbook (root)
- CONTRIBUTING.md — workflow, single-test examples
- DESIGN.md — high-level architecture & DDL
- AGENTS.md / SKILL.md — agent-specific guidance and `.opencode/` knowledge hub
- bunfig.toml — test runner config (preload, timeout, coverage)
- package.json — curated scripts for build/test/lint

---

## Notes for Copilot sessions

- Prefer using package scripts (package.json) and hoox wrapper commands rather than ad-hoc bash when automating tasks.
- When modifying workers, ensure wrangler config (`wrangler.jsonc`) and per-worker `wrangler.jsonc` are updated; run `bun run build:dashboard` before deploying dashboard.
- Respect worker runtime constraints (no Node built-ins) when generating code for workers.
- If tests fail locally, run targeted package tests (`bun run test:...`) and inspect `reports/junit.xml` for CI-like output.

---

If this file should be extended with actionable snippets for common code fixes (e.g., typical lint fixes, common test flakiness troubleshooting), add them under a new "Troubleshooting" section.

---

## MCP servers

Copy of MCP server entries provided in the repository's opencode configuration (paste exact block below):

```json
{
  "cloudflare": {
    "type": "remote",
    "url": "https://mcp.cloudflare.com/mcp",
    "enabled": true
  },
  "cloudflare-docs": {
    "type": "remote",
    "url": "https://docs.mcp.cloudflare.com/mcp",
    "enabled": true
  },
  "shadcn": {
    "type": "local",
    "command": ["npx", "shadcn@latest", "mcp"],
    "enabled": true
  },
  "cloudflare-bindings": {
    "type": "remote",
    "url": "https://bindings.mcp.cloudflare.com/mcp",
    "enabled": true
  },
  "cloudflare-builds": {
    "type": "remote",
    "url": "https://builds.mcp.cloudflare.com/mcp",
    "enabled": true
  },
  "cloudflare-observability": {
    "type": "remote",
    "url": "https://observability.mcp.cloudflare.com/mcp",
    "enabled": true
  }
}
```

Notes:

- These entries were pasted from the opencode configuration provided. If these endpoints require secrets or network access, ensure CI/GH Actions have appropriate access.
- Enable/disable or modify commands per local environment (e.g., replace the `shadcn` local command if using a different shadcn setup).
