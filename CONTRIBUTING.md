<!--
  Copyright (c) 2026 HOOX · jango-blockchained
  SPDX-License-Identifier: CC-BY-4.0
-->

# Contributing to Hoox

First off, thank you for considering contributing to Hoox! It's people like you that make Hoox such a great tool for the algorithmic trading community.

---

## 🏗️ How Can I Contribute?

### 🐛 Reporting Bugs

This section guides you through submitting a bug report for Hoox. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

- Use the [GitHub Issues](https://github.com/jango-blockchained/hoox-setup/issues) tracker to report bugs.
- Provide a clear and descriptive title (e.g., "Webhook returns 500 when `cluster` param missing from payload").
- Describe the exact steps to reproduce the problem.
- Include relevant logs from `hoox logs tail <worker>`.
- Note the environment: local Docker vs. native Wrangler, Bun version, Wrangler version, Cloudflare account region.

### 💡 Suggesting Enhancements

- Use the GitHub Issues tracker to suggest enhancements.
- Provide a clear and descriptive title for the issue.
- Provide a step-by-step description of the suggested enhancement in as many details as possible.
- Explain why this enhancement would be useful to most Hoox users.
- If applicable, include mockups or diagrams (Mermaid syntax preferred).

### 🔀 Pull Requests

- Fill in the required PR template.
- Do not include issue numbers in the PR title.
- Include screenshots and animated GIFs in your pull request whenever possible.
- Follow the coding style guidelines below.
- **Add tests!** No new code should ship without corresponding test assertions.
- **Document new code** — update or create relevant documentation in `docs/`.

---

## 🛠️ Development Setup

### Prerequisites

| Tool                                                                | Minimum Version   | Purpose                               |
| ------------------------------------------------------------------- | ----------------- | ------------------------------------- |
| [Bun](https://bun.sh)                                               | 1.2+              | Runtime, package manager, test runner |
| [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) | Latest            | Cloudflare Workers deployment         |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/)   | Latest (optional) | Containerized local development       |
| [GCloud/gh CLI](https://cli.github.com/)                            | Latest (optional) | GitHub automation                     |

### Step-by-Step Setup

```bash
# 1. Fork the repo on GitHub and clone your fork
git clone --recursive https://github.com/<YOUR_USERNAME>/hoox-setup.git
cd hoox-setup

# 2. Install monorepo dependencies via Bun workspaces
bun install

# 3. Copy the environment template and fill in required values
cp .env.example .env.local
cp workers/hoox-worker/.dev.vars.example workers/hoox-worker/.dev.vars

# 4. Bootstrap the workspace (sets up Wrangler configs, local bindings)
bun run setup

# 5. Run the full CI verification pipeline to confirm everything works
bun test

# 6. Start local development (choose runtime when prompted)
hoox dev start
```

### Git Workflow

```bash
# Create a feature/bugfix branch from main
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description

# Make your changes with descriptive commits
git commit -m "feat: add retry logic for ExchangeRouter timeout handling"
git commit -m "fix: resolve idempotency key collision on rapid identical signals"

# Push and open a PR
git push origin your-branch
```

**Branch naming convention**: `feat/`, `fix/`, `docs/`, `refactor/`, `test/` prefixes.

### Running Tests

```bash
# Full local CI pipeline (lint + typecheck + unit + build)
hoox test

# Targeted workspace tests
bun run test:cli          # CLI package tests
bun run test:tui          # Terminal UI tests
bun run test:shared       # Shared library tests
bun run test:workers      # All worker unit tests

# Single test file with watch mode
bun test workers/trade-worker/src/index.test.ts --watch

# Integration tests (requires local services)
bun run test:integration

# Live Cloudflare tests (requires credentials in tests/live/.env)
bun run test:live --jobs 1
```

### Code Style

- **Package manager**: `bun` — use `bun add`, `bun remove`, `bun run`
- **Formatter**: `prettier` — auto-formatted on pre-commit via husky
- **Linter**: `eslint` with strict TypeScript rules
- **Type safety**: `tsc --noEmit` must pass with zero errors (`strict: true`)
- **Test runner**: Bun native test runner (`bun test`)
- **No `as any`**: Use `as unknown as TargetType` for type assertions in tests
- **Secret handling**: Never commit `.env.local`, `.dev.vars`, or test credentials

### Testing Patterns

When adding tests for new features:

```typescript
import { describe, it, expect } from "bun:test";

describe("new feature description", () => {
  it("should handle expected case", async () => {
    // Arrange
    // Act
    // Assert
    expect(result).toBe(expected);
  });

  it("should gracefully handle edge cases", async () => {
    // ...
  });
});
```

### Documentation Standards

- Every new feature must have corresponding documentation in `docs/`
- Update the relevant concept doc, guide, or reference file
- Add cross-references in `docs/enduser/home.md` or `docs/devops/home.md`
- Ensure all `Next Steps` links resolve to existing files

---

## 🤝 Code of Conduct

Be respectful, constructive, and professional. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

---

## 📋 Reference

| Resource              | Link                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Bug Tracker           | [GitHub Issues](https://github.com/jango-blockchained/hoox-setup/issues)                                                                |
| Documentation Home    | [docs/enduser/home.md](docs/enduser/home.md)                                                                                            |
| DevOps Manual         | [docs/devops/home.md](docs/devops/home.md)                                                                                              |
| Enduser Full Docs PDF | [/hoox-setup/Enduser-Full-Documentation.pdf](https://github.com/jango-blockchained/hoox-setup/blob/main/Enduser-Full-Documentation.pdf) |
| Latest Release        | [Releases Page](https://github.com/jango-blockchained/hoox-setup/releases)                                                              |
