# @jango-blockchained/hoox-cli

> **See also:** [Docs home](../../docs/index.mdx) · [CLI Command Reference](../../docs/enduser/reference/cli-commands.mdx) · [Monorepo README](../../README.md)

> Hoox CLI — manage Cloudflare Workers, infrastructure, secrets, and deployments.

> **Runtime requirement:** Bun ≥ 1.2. The bin shebang and bundle target are Bun-only; `npm install -g` will install the package but the CLI will not run under Node.js.

**v0.10.1** — operator security plane: fail-closed `tui --remote`, transport profile (Bearer + Access), `doctor --security`, `tunnel check`, management `/v1/*` contract. **v0.9.x** shipped hop-level `perf fastpath` observability and reliability fixes.

## Features

- **One-shot Onboarding** (`hoox onboard`): Full bootstrap from a fresh clone — collects credentials, configures workers, provisions D1/KV, generates keys, pushes secrets, deploys dashboard. The recommended entry point for new users.
- **Config & Setup Wizards** (`hoox init`, `hoox setup`): Split into two steps — `init` writes `wrangler.jsonc` and collects integration secrets; `setup` generates keys, applies D1 schema, and pushes secrets to Cloudflare. Run separately when you need fine-grained control.
- **Infrastructure as Code**: Manage D1, KV, R2, Queues, Vectorize, and Analytics via `hoox infra`.
- **Environment Management**: Declarative 27-key env matrix via `hoox config env`.
- **KV Config Sync**: 16-key manifest with `apply-manifest` for CONFIG_KV.
- **Database Operations**: Schema apply, migrations, query, export, reset via `hoox db`.
- **Deploy Automation**: Workers + dashboard + telegram webhook + KV config in one flow.
- **Performance Measurement** (`hoox perf`): `fastpath` subcommand sends synthetic probes and reports p50/p95/p99 per-hop latency.
- **Observability** (`hoox trace`): Query Cloudflare Workers Observability REST API for events, metrics, and traces.
- **Health Checks** (`hoox check health`): The single source of truth for worker health probes. Run after deployments or in CI.
- **Operational Monitoring** (`hoox monitor`): Recent trades, kill switch, queue depth, backup, system logs.
- **Repair & Recovery** (`hoox repair`): Comprehensive system check, guided rebuild, per-component repair.
- **Top-level Secrets & Keys**: `hoox secrets` and `hoox keys` for Cloudflare Worker secrets and internal auth keys.
- **Unified Dashboard** (`hoox dashboard dev | deploy`): Start the dev server or build & deploy the Next.js dashboard.
- **Interactive menu & TUI**: Running `hoox` with no arguments opens the interactive menu; `hoox tui` launches the full OpenTUI operations center.
- **Operator security plane** (`hoox doctor`, `hoox tunnel`): Path/TUI hygiene, fail-closed remote transport (Bearer + Access), and private-ingress checks.
- **Modern-minimal output**: Zinc/indigo palette, completion footer with “next step” suggestions, “did you mean …” for typos, custom help formatter, `--no-color` / `NO_COLOR` / `TERM=dumb`, compact `formatNumber` / `formatBytes`. Shared `format*` helpers available to plugin authors.
- **Shell Completions**: bash, zsh, and fish completion scripts via `hoox completion <shell>`.

## Installation

### Global Install (Recommended)

```bash
# Using bun (the only supported runtime)
bun add -g @jango-blockchained/hoox-cli
```

> The CLI is a Bun bundle — `npm install -g` will not produce a working binary.

### Local Development

```bash
cd packages/cli
bun install
bun run build   # produces dist/index.js — required for `hoox` after global install
```

> `bin/hoox.js` resolves `dist/index.js` first and falls back to `src/index.ts`
> when `dist/` is missing, so contributors who skip the build step can still
> run the CLI via `bun bin/hoox.js …` or a `bun link`-based install. Production
> releases and the `prepublishOnly` script always build first.

## Quick Start

```bash
# One-shot onboarding (collects credentials, provisions, deploys)
hoox onboard

# Or step-by-step: write config first, then provision
hoox init
hoox setup

# Verify the system
hoox check setup
hoox check health

# Deploy to Cloudflare
hoox deploy all --auto

# Measure fast-path latency
hoox perf fastpath run --n 50
```

## Available Commands

| Command           | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `hoox onboard`    | **Recommended entry point.** One-shot full bootstrap (init + setup)  |
| `hoox init`       | Interactive setup wizard (writes `wrangler.jsonc`, collects secrets) |
| `hoox setup`      | Auto-bootstrap infrastructure (auth, keys, D1, secrets, dashboard)   |
| `hoox clone`      | Clone worker repositories as git submodules                          |
| `hoox dev`        | Start local development environment for all workers                  |
| `hoox deploy`     | Deploy workers, dashboard, telegram webhook, and KV config           |
| `hoox infra`      | Manage infrastructure (D1, KV, R2, Queues, Vectorize, Analytics)     |
| `hoox config`     | Manage `wrangler.jsonc` configuration                                |
| `hoox secrets`    | Manage secrets (`sync --system` for mesh keys only)                  |
| `hoox keys`       | Manage internal auth keys                                            |
| `hoox check`      | Validate setup, prerequisites, and worker health                     |
| `hoox db`         | Manage D1 databases (apply, migrate, query, export, reset)           |
| `hoox monitor`    | Monitor trades, logs, kill switch, queue, backup                     |
| `hoox workers`    | Per-worker operations (list, dev, logs)                              |
| `hoox repair`     | Diagnose and repair the system (check, rebuild, per-component)       |
| `hoox schema`     | Validate/generate worker wrangler manifests against canonical specs  |
| `hoox update`     | Pull repo/submodule updates or update wrangler                       |
| `hoox logs`       | Stream and filter Cloudflare Worker logs                             |
| `hoox test`       | Run tests and CI pipeline                                            |
| `hoox waf`        | Manage Cloudflare WAF rules and policies                             |
| `hoox dashboard`  | Dashboard operations (`dev`, `deploy`)                               |
| `hoox tui`        | Launch the OpenTUI terminal dashboard                                |
| `hoox doctor`     | Check paths, TUI entry, and operator security hygiene                |
| `hoox tunnel`     | Private operator ingress helpers (cloudflared + Access)              |
| `hoox agent`      | AI agent operations (health probe)                                   |
| `hoox trace`      | Query Cloudflare Workers Observability (events, metrics, traces)     |
| `hoox perf`       | Performance measurement tools (`fastpath` probe-based latency)       |
| `hoox disclaimer` | Display legal disclaimer                                             |
| `hoox completion` | Generate shell completion script (bash, zsh, fish)                   |

### Global Options

All commands support these global options:

| Option       | Description                                  |
| ------------ | -------------------------------------------- |
| `--json`     | Output in JSON format (useful for scripting) |
| `--quiet`    | Minimal output mode                          |
| `--no-color` | Disable ANSI colors (`NO_COLOR` also works)  |

## Usage Examples

### Onboard a New Project

```bash
# One-shot (recommended) — fully automatic, no separate setup step
hoox onboard --token cfut_xxx --account xxx --preset full

# Interactive
hoox onboard
```

Interactive prompts collect your Cloudflare Account ID, API Token, and subdomain prefix; then it writes the config and provisions infrastructure end-to-end.

### Step-by-Step Onboarding

```bash
# 1. Write workspace config (wrangler.jsonc, secrets)
hoox init

# 2. Provision infrastructure (keys, D1 schema, push secrets, deploy dashboard)
hoox setup
```

### Check Prerequisites

```bash
# Check all tools
hoox check prerequisites

# Check specific tool
hoox check prerequisites --tool bun
```

Validates bun ≥1.2, git ≥2.40, wrangler, Docker, Cloudflare auth, and repository integrity.

### Manage Secrets

```bash
# List secrets for a worker
hoox secrets list trade-worker

# Set a secret
hoox secrets set trade-worker BINANCE_KEY_BINDING

# Delete a secret
hoox secrets delete trade-worker BINANCE_KEY_BINDING

# Sync system/mesh secrets only (recommended after key rotation)
hoox secrets sync --system
# Alias: hoox secrets sync --required

# Sync all declared secrets from .dev.vars
# Reports partial results: synced / skipped (placeholders) / failed
hoox secrets sync
```

### Manage Internal Keys

```bash
# Generate new internal keys (writes to .keys/)
hoox keys generate

# List existing keys
hoox keys list
```

### Configure Environment

```bash
# Interactive env setup (all 27 vars across 8 sections)
hoox config env init

# Show current env (secrets redacted)
hoox config env show

# Validate required vars
hoox config env validate

# Generate per-worker .dev.vars
hoox config env generate-dev-vars
```

### Manage wrangler.jsonc

```bash
# Display current configuration
hoox config show

# Update a config value
hoox config set workers.agent-worker.enabled false
```

### Manage KV Keys

```bash
# Apply manifest defaults (16 keys)
hoox config kv apply-manifest

# Show expected manifest
hoox config kv manifest

# Individual key operations
hoox config kv list
hoox config kv get trade:kill_switch
hoox config kv set trade:kill_switch "false"
hoox config kv delete trade:kill_switch
```

### Deploy to Cloudflare

```bash
# Deploy all workers then dashboard
hoox deploy all

# Deploy all — skip rebuild prompt, use existing build
hoox deploy all --auto

# Deploy with force rebuild
hoox deploy all --rebuild

# Post-deploy: set Telegram webhook
hoox deploy telegram-webhook

# Post-deploy: update dashboard service URLs
hoox deploy update-internal-urls

# Post-deploy: apply KV manifest
hoox deploy kv-config

# Deploy specific worker
hoox deploy worker trade-worker
```

### Dashboard Operations

```bash
# Start dashboard dev server
hoox dashboard dev
# equivalent to: hoox dev dashboard

# Build and deploy the dashboard
hoox dashboard deploy
# equivalent to: hoox deploy dashboard

# Force rebuild before deploy
hoox dashboard deploy --rebuild
```

### Health Checks

```bash
# Check all worker health endpoints (the single source of truth)
hoox check health

# Try to auto-fix any issues found
hoox check health --fix

# Full system validation (config, infra, secrets, database)
hoox check setup
```

### Database Operations

```bash
# Apply schema to local or remote
hoox db apply
hoox db apply --remote

# Run tracking migrations
hoox db migrate --remote

# List tables
hoox db list --remote

# Execute read-only queries
hoox db query "SELECT COUNT(*) FROM trades" --remote

# Export to timestamped .sql
hoox db export

# Reset D1 (DESTRUCTIVE)
hoox db reset --confirm
```

### Manage Infrastructure

```bash
# Auto-provision from wrangler.jsonc
hoox infra provision

# Individual resource management
hoox infra d1 list
hoox infra kv create my-namespace
hoox infra r2 list
hoox infra queues create my-queue
hoox infra vectorize list
hoox infra vectorize create my-index
hoox infra analytics list
```

### Monitor Operations

```bash
# Show recent trades
hoox monitor trades 20

# Show system logs
hoox monitor logs
hoox monitor logs hoox

# Kill switch operations
hoox monitor kill-switch show
hoox monitor kill-switch on     # Halt all trading
hoox monitor kill-switch off    # Resume trading

# Queue depth
hoox monitor queue-depth

# Backup D1 database
hoox monitor backup
```

### Performance Measurement

```bash
# Send 50 synthetic probes and report p50/p95/p99 latency
hoox perf fastpath run --n 50

# Continuous probing for 60 seconds
hoox perf fastpath tail --duration 60

# Query past probe events
hoox perf fastpath report --from 1h
```

### Operator Security & Private Ingress

```bash
# Paths, TUI entry, and runtime layout
hoox doctor

# Hygiene + optional management /v1/health probes
hoox doctor --security
hoox doctor --security --api-url https://mgmt.example.com

# cloudflared presence + private-ingress guidance
hoox tunnel check
hoox tunnel check --api-url https://mgmt.example.com --probe
```

### Repair and Recovery

```bash
# Comprehensive system check (5 steps)
hoox repair check

# Redeploy a single worker
hoox repair worker trade-worker

# Verify infrastructure exists
hoox repair infra

# Re-upload all secrets
hoox repair secrets

# Reset KV keys to defaults
hoox repair kv

# Re-apply schema + migrations
hoox repair db

# Full guided rebuild (interactive, WARNING: destructive)
hoox repair rebuild
```

### JSON Output for Scripting

```bash
hoox check health --json
hoox check prerequisites --json
hoox infra d1 list --json
```

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.2
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Wrangler CLI (installed automatically with dependencies)

### Build from Source

```bash
# Clone the repository (workers are submodules)
git clone --recursive https://github.com/jango-blockchained/hoox.git
cd hoox

# Install dependencies
bun install

# Build the CLI
cd packages/cli
bun run build
```

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun run test:coverage

# Run specific test file
bun test path/to/test.test.ts
```

### Linting and Type Checking

```bash
# Lint code
bun run lint

# Type check
bun run typecheck
```

### CI Pipeline

The CI pipeline runs in this order:

1. `bun run lint` — ESLint check
2. `bun run typecheck` — TypeScript check (`tsc --noEmit`)
3. `bun test packages/cli --coverage` — Run tests with coverage (80% threshold)
4. `bun run build` — TypeScript build check

## Project Structure

```
packages/cli/
├── src/
│   ├── index.ts              # Main entry point
│   ├── commands/
│   │   ├── init/             # Interactive setup wizard (config)
│   │   ├── setup/            # Auto-bootstrap infrastructure
│   │   ├── onboard/          # One-shot init + setup
│   │   ├── secrets/          # Top-level secrets management
│   │   ├── keys/             # Top-level internal keys management
│   │   ├── dev/              # Local development
│   │   ├── deploy/           # Deploy, telegram-webhook, update-internal-urls
│   │   ├── dashboard/        # Dashboard dev/deploy
│   │   ├── infra/            # D1, KV, R2, Queues, Vectorize, Analytics
│   │   ├── config/           # wrangler.jsonc, env, kv
│   │   ├── check/            # Prerequisites, setup, health, fix
│   │   ├── db/               # Database operations
│   │   ├── monitor/          # Trades, logs, kill-switch, backup
│   │   ├── workers/          # List, dev, logs
│   │   ├── repair/           # Check, worker, infra, secrets, rebuild
│   │   ├── schema/           # Manifest validate/generate
│   │   ├── update/           # Repo/submodule/wrangler update
│   │   ├── logs/             # Worker log tailing
│   │   ├── test/             # CI pipeline
│   │   ├── waf/              # WAF management
│   │   ├── clone/            # Submodule cloning
│   │   ├── tui/              # TUI launcher
│   │   ├── doctor/           # Runtime paths + operator security
│   │   ├── tunnel/           # Private ingress helpers
│   │   ├── agent/            # AI agent operations
│   │   ├── trace/            # Cloudflare Observability queries
│   │   ├── perf/             # Performance measurement
│   │   └── disclaimer/       # Legal disclaimer
│   ├── services/
│   │   ├── cloudflare/       # Wrangler CLI wrapper
│   │   ├── config/           # wrangler.jsonc reader
│   │   ├── db/               # D1 operations
│   │   ├── docker/           # Docker compose wrapper
│   │   ├── env/              # Environment definitions
│   │   ├── kv/               # KV key management
│   │   ├── operator-security/# Access / tunnel probes
│   │   ├── perf/             # Percentile, probe-sender, observability-reader
│   │   ├── prerequisites/    # Tool version checks
│   │   ├── runtime/          # Global ~/.hoox layout
│   │   └── secrets/          # Secret management
│   ├── ui/                   # Interactive menu (clack)
│   └── utils/                # Errors, formatters, theme
├── bin/
│   └── hoox.js              # CLI binary entry point
├── package.json
└── README.md
```

## Key Dependencies

| Package                           | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `commander`                       | CLI framework for command registration and parsing |
| `@clack/prompts`                  | Interactive prompts for the TUI                    |
| `ansis`                           | Terminal styling and colors                        |
| `jsonc-parser`                    | Parse `wrangler.jsonc` configuration files         |
| `@jango-blockchained/hoox-shared` | Shared types and utilities                         |

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code passes linting, type checking, and all tests before submitting.

## License

MIT License

Copyright (c) 2026 Hoox Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Links

- [GitHub Repository](https://github.com/jango-blockchained/hoox)
- [Issue Tracker](https://github.com/jango-blockchained/hoox/issues)
- [Product docs](https://docs.hoox.sh)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
