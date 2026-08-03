/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @hoox/test-utils — public entry point.
 *
 * Re-exports the consolidated bun:test preload helpers so workspaces can
 * `import "@hoox/test-utils/setup"` (or, more commonly, point `bunfig.toml`'s
 * `preload` directly at `packages/test-utils/src/setup.ts`).
 *
 * The actual setup (global `expect/jest/test/describe/beforeEach/afterEach`,
 * `Response/Request/Headers` on the global scope, and the `cloudflare:workers`
 * module mock) lives in `./setup.ts`. See that file for the full contract.
 */
export * from "./setup.ts";
