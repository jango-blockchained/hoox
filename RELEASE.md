<!--
  Copyright (c) 2026 HOOX · jango-blockchained
  SPDX-License-Identifier: CC-BY-4.0
-->

# Release Process

This document describes how to publish a new release of the Hoox monorepo.

## Overview

The release pipeline is fully automated via GitHub Actions. Pushing a version tag triggers:

1. **Test & Build** — unit tests for `packages/cli` and `packages/shared`, then `bun run build:packages`
2. **npm Publish** — publishes `@jango-blockchained/hoox-cli` to the npm registry
3. **GitHub Packages Publish** — publishes the same package to GitHub Packages
4. **GitHub Release** — creates a tagged release on GitHub

## Prerequisites

- Write access to the repository
- GitHub Actions secrets configured:
  - `NPM_TOKEN` — npm automation token for `@jango-blockchained` org
  - `GITHUB_TOKEN` — automatically provided by Actions (for GitHub Packages + Release)

## How to Release

### 1. Prepare the Release

Ensure `main` (or your release branch) has all the changes you want to ship:

```bash
git checkout main
git pull origin main
```

### 2. Tag and Push

```bash
# For a patch release (recommended for bugfixes)
git tag v0.8.0
git push origin v0.8.0

# For major/minor releases
git tag v0.9.0
git push origin v0.9.0
```

The release workflow triggers on tags matching `v0.*` or `v1.*`.

### 3. Monitor the Workflow

Watch the release at:
https://github.com/jango-blockchained/hoox-setup/actions/workflows/release.yml

The workflow takes approximately 3-5 minutes.

### 4. Verify

After the workflow completes:

- **npm**: `npm view @jango-blockchained/hoox-cli` should show the new version
- **GitHub Packages**: Check https://github.com/jango-blockchained/hoox-setup/packages
- **GitHub Release**: Check https://github.com/jango-blockchained/hoox-setup/releases

## What Gets Published

| Artifact                       | Destination     | Trigger      |
| ------------------------------ | --------------- | ------------ |
| `@jango-blockchained/hoox-cli` | npm registry    | `v*.*.*` tag |
| `@jango-blockchained/hoox-cli` | GitHub Packages | `v*.*.*` tag |
| GitHub Release                 | GitHub Releases | `v*.*.*` tag |

## Versioning

We follow [Semantic Versioning](https://semver.org/):

- **Patch** (`v0.8.0` → `v0.8.1`): Bug fixes, minor changes
- **Minor** (`v0.8.0` → `v0.9.0`): New features, backwards-compatible
- **Major** (`v0.x` → `v1.0.0`): Breaking changes

## CI Pipeline (Pre-Merge)

Before merging, the CI runs:

```bash
bun run lint       # ESLint (flat config)
bun run typecheck  # Multi-project tsc
bun test           # All unit tests (80% coverage threshold)
bun run build      # Build packages + typecheck
```

This runs on every PR and push to `main`. Fix any failures before tagging.

## Manual Release (Alternative)

If GitHub Actions is unavailable, you can publish manually:

```bash
# Build the CLI
cd packages/cli && bun run build

# Publish to npm (requires npm login with @jango-blockchained access)
cd packages/cli && npm publish --access public

# Publish to GitHub Packages (requires .npmrc with GitHub token)
cd packages/cli && npm publish --access public --registry https://npm.pkg.github.com
```

## Setup Command

After a fresh clone, run `hoox setup --yes` to:

1. Install `wrangler` (if missing)
2. Initialize submodules (`git submodule update --init --recursive`)
3. Build packages (`packages/shared` and `packages/cli`)
4. Generate encryption keys (written to `.keys/setup.env` + per-worker `.dev.vars`)
5. Create D1 database (if missing)
6. Apply D1 schema
7. Set Cloudflare secrets
8. Reconcile legacy secret names
9. Build and deploy the dashboard
10. Verify everything worked
