/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test setup / preload for TUI package.
 *
 * Pre-loads @opentui/core so its top-level await resolves BEFORE any test
 * code runs. This prevents the Temporal Dead Zone (TDZ) race condition
 * that causes:
 *   "Cannot access 'FFIRenderLib' before initialization"
 *
 * OpenTUI's bundled index-ysvpktsp.js has:
 *   line 12404: await import(`@opentui/core-${platform}-${arch}`)
 *   line 13725: class FFIRenderLib { ... }      // AFTER the await
 *   line 15202: function resolveRenderLib() { ... }
 *
 * If resolveRenderLib() is called while the module is still suspended by
 * the top-level await, FFIRenderLib is in the TDZ → ReferenceError.
 *
 * This preload ensures the module finishes evaluating before any test
 * imports trigger resolveRenderLib. It also wraps createTestRenderer with
 * error handling for environments where the native library is absent.
 */

// yoga-layout (dep of @opentui/core) uses fetch() to load its WASM binary.
// Must be set BEFORE @opentui/core is imported below.
global.fetch = fetch;

import { mock } from "bun:test";

// ── Module-level state ────────────────────────────────────────────────────────

type CoreTestingModule = typeof import("@opentui/core/testing");
type CreateTestRendererFn = CoreTestingModule["createTestRenderer"];
let realCreateTestRenderer: CreateTestRendererFn | null = null;
let coreAvailable = false;

// ── Load real module (pre-resolves the top-level await) ────────────────────────

try {
  // 1. Load @opentui/core first — this triggers its top-level await
  //    which loads the platform-specific native library package.
  //    If the native library is present, the await resolves quickly and
  //    the module finishes evaluating (FFIRenderLib becomes defined).
  await import("@opentui/core");

  // 2. Now load the testing module and capture its createTestRenderer
  const coreTesting = await import("@opentui/core/testing");
  realCreateTestRenderer = coreTesting.createTestRenderer;
  coreAvailable = true;
} catch {
  // Core not available — tests that require rendering will get a clear error
  coreAvailable = false;
}

// ── Mock @opentui/core/testing ─────────────────────────────────────────────────
//
// This mock intercepts all imports of @opentui/core/testing so that:
//   - If the real module loaded successfully → uses real createTestRenderer
//     (with error-wrapping for defensive handling)
//   - If the real module failed → provides a mock that throws a clear
//     error message about the missing native library
//   - The Temporal Dead Zone race condition is avoided because we've
//     already pre-loaded @opentui/core above

mock.module("@opentui/core/testing", () => {
  if (coreAvailable && realCreateTestRenderer) {
    return {
      // Spread any other exports from the real module (setRendererCapabilities,
      // createTerminalCapabilities, MockTreeSitterClient, etc.)
      ...shareTestingExports(),

      // Wrap createTestRenderer with defensive error handling
      createTestRenderer: async (...args: Parameters<CreateTestRendererFn>) => {
        try {
          return await realCreateTestRenderer!(...args);
        } catch (cause) {
          throw new Error(
            `OpenTUI render library initialization failed: ${
              cause instanceof Error ? cause.message : String(cause)
            }. ` +
              "Ensure @opentui/core native library is installed for your platform.",
            { cause }
          );
        }
      },
    };
  }

  // Fallback: native library not available → provide a mock that throws
  // a clear, actionable error (instead of the confusing TDZ ReferenceError)
  return {
    createTestRenderer: async (..._args: Parameters<CreateTestRendererFn>) => {
      throw new Error(
        "OpenTUI native render library is not available in this environment. " +
          "Render-dependent tests cannot run. " +
          "Install @opentui/core native library for your platform, " +
          "or run tests on a supported platform (linux-x64, darwin-arm64, etc.)."
      );
    },

    setRendererCapabilities: () => {},
    createTerminalCapabilities: (overrides = {}) => overrides,
    createSpy: () => ({
      calls: [],
      callCount: () => 0,
      calledWith: () => false,
      reset: () => {},
    }),
    MockTreeSitterClient: class {},
    KeyCodes: {},
    MouseButtons: {},
    pasteBytes: (_s: string) => new Uint8Array(),
    createMockKeys: () => ({}),
    createMockMouse: () => ({}),
    TestRecorder: class {},
  };
});

// ── Mock helper exports ─────────────────────────────────────────────────────────

/** Re-export testing utilities from the real module for convenience. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shareTestingExports(): Record<string, any> {
  return {
    setRendererCapabilities: () => {},
    createTerminalCapabilities: (o: Record<string, unknown> = {}) => o,
    createSpy: () => ({
      calls: [],
      callCount: () => 0,
      calledWith: () => false,
      reset: () => {},
    }),
    MockTreeSitterClient: class {},
    KeyCodes: {},
    MouseButtons: {},
    pasteBytes: (_s: string) => new Uint8Array(),
    createMockKeys: () => ({}),
    createMockMouse: () => ({}),
    TestRecorder: class {},
  };
}

// Prevent tests from accidentally spawning real wrangler, hoox CLI, or
// other heavy processes during unit/integration runs. Set
// HOOX_TEST_ALLOW_WRANGLER=1 to allow the real spawn during live testing.
import { installSpawnShim } from "@hoox/test-utils/spawn-shim";
installSpawnShim();

// ── Shared CLI bridge test double (process-wide, full surface) ───────────────
//
// Install ONE complete mock of `cli-bridge` here so individual test files do
// not each call mock.module with partial stubs (which strip methods other
// suites need under Bun's process-wide module mock).
//
// Per-test overrides: import { cliBridgeDouble, resetCliBridgeDouble } from
// "./cli-bridge-test-double" and use mockResolvedValue / mockImplementation.
import {
  cliBridgeDouble,
  createCliBridgeModuleMock,
} from "./cli-bridge-test-double";

const cliBridgeModule = await createCliBridgeModuleMock();

/** Register under every import specifier used across the suite. */
function installCliBridgeDouble(): void {
  const paths = [
    // Absolute file URL (Bun resolves relative imports to this)
    new URL("./services/cli-bridge/index.ts", import.meta.url).href,
    new URL("./services/cli-bridge/", import.meta.url).href,
    // Relative from this preload file
    "./services/cli-bridge",
    "./services/cli-bridge/index.ts",
    // Relative paths used by view tests under components/views/
    "../../services/cli-bridge",
    // Relative paths used by store tests
    "../services/cli-bridge",
  ];
  for (const p of paths) {
    try {
      mock.module(p, () => cliBridgeModule);
    } catch {
      // Specifier may be invalid in some environments — ignore
    }
  }
}

installCliBridgeDouble();

// Expose for tests that need the double without importing the helper path
(
  globalThis as unknown as { __hooxCliBridgeDouble?: typeof cliBridgeDouble }
).__hooxCliBridgeDouble = cliBridgeDouble;

// ── Shared network doubles (api-client + SSE) ────────────────────────────────
//
// service-store (and views that call fetchWorkers / stream*) must not hit a
// real HTTP API in unit tests. One full mock here replaces per-file
// mock.module of api-client / sse.
import {
  hooxFetchMock,
  subscribeSSEMock,
  resetNetworkDoubles,
} from "./network-test-double";

resetNetworkDoubles();

async function installNetworkDoubles(): Promise<void> {
  let realApi: Record<string, unknown> = {};
  try {
    realApi =
      (await import("@jango-blockchained/hoox-shared/api-client")) as Record<
        string,
        unknown
      >;
  } catch {
    realApi = {};
  }

  const apiFactory = () => ({
    ...realApi,
    hooxFetch: hooxFetchMock,
  });

  const sseFactory = () => ({
    subscribeSSE: subscribeSSEMock,
  });

  // From packages/tui/src → ../../shared/src (sibling package)
  const apiPaths = [
    new URL("../../shared/src/api-client.ts", import.meta.url).href,
    new URL("../../shared/src/api-client.ts", import.meta.url).pathname,
    "@jango-blockchained/hoox-shared/api-client",
    // Relative as resolved from packages/shared/src/stores/service-store.ts
    "../api-client",
    "../api-client.ts",
    "../../../../packages/shared/src/api-client",
  ];
  const ssePaths = [
    new URL("../../shared/src/sse.ts", import.meta.url).href,
    new URL("../../shared/src/sse.ts", import.meta.url).pathname,
    "@jango-blockchained/hoox-shared/sse",
    "../sse",
    "../sse.ts",
    "../../../../packages/shared/src/sse",
  ];

  for (const p of apiPaths) {
    try {
      mock.module(p, apiFactory);
    } catch {
      // ignore bad specifier
    }
  }
  for (const p of ssePaths) {
    try {
      mock.module(p, sseFactory);
    } catch {
      // ignore
    }
  }
}

await installNetworkDoubles();
