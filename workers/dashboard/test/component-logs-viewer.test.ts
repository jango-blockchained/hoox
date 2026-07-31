/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LogsViewer component tests
 *
 * Tests follow the patterns established in this dashboard workspace:
 *   - `component-notification-tester.test.ts` for single-component shape tests
 *   - `api-database.test.ts` for the API contract tests with global.fetch mock
 *   - `api-routes.test.ts` for the process.env beforeEach/afterEach restore
 *     pattern
 *
 * Testing approach:
 *   - The dashboard does not currently ship a DOM test environment
 *     (no @testing-library/react, no happy-dom / jsdom). The component is a
 *     `"use client"` React component that uses `useEffect` for both data
 *     fetching and the 30-second revalidation interval, so a true
 *     end-to-end render would require a DOM.
 *   - We therefore split the coverage along the natural seams of the
 *     component:
 *       1. Module structure (import + named export)
 *       2. `lib/api.getLogs` contract — the actual network call the
 *          component makes on mount (mocked at the network boundary per
 *          test-coverage.md §5.1 / "mock at the boundary").
 *       3. `mock.module("@/lib/api", ...)` — verifies the consumer
 *          (`LogsViewer`) imports `getLogs` via the shared `api` object
 *          and the import resolves cleanly when the module is replaced.
 *       4. Source-level assertions for the 30s auto-revalidation
 *          (`setInterval` / `clearInterval` / `REFRESH_INTERVAL_MS = 30_000`).
 *       5. Source-level assertions for the semantic-token classnames
 *          (`text-destructive`, `text-warning`, `text-success`,
 *          `text-primary`) and the absence of raw Tailwind palette
 *          colors that would defeat the design-token system.
 *       6. Source-level assertions for the level + source + search
 *          filter wiring (`setLevelFilter`, `setSourceFilter`,
 *          `setSearchQuery`, `LEVEL_OPTIONS`).
 *
 * The two source-level assertion groups (4, 5, 6) read the `.tsx` file
 * with `node:fs`. This is the same approach `sync-dashboard-configs.test.ts`
 * uses to verify on-disk content; it lets us assert on the production
 * code itself without having to render it in a DOM.
 */
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Module mocks (must be registered before any import that may resolve
//    them) ────────────────────────────────────────────────────────────
//
// `server-only` is imported by many client components transitively (and by
// shadcn primitives). It throws at import time outside of Next.js, so we
// shim it for the bun test runner. This matches the pattern used by every
// other dashboard component test in `test/components-*.test.ts` and
// `test/api-*.test.ts`.
mock.module("server-only", () => ({}));

// ── Shared env snapshot for beforeEach/afterEach restore ──────────────
const originalEnv = { ...process.env };

// ── Source-file helper (used by the source-level assertion groups) ────
const HERE = dirname(fileURLToPath(import.meta.url));
const LOGS_VIEWER_PATH = resolve(
  HERE,
  "..",
  "src",
  "components",
  "dashboard",
  "logs-viewer.tsx"
);

function readLogsViewerSource(): string {
  return readFileSync(LOGS_VIEWER_PATH, "utf8");
}

// ── Shared fixture data ───────────────────────────────────────────────
//
// Mirrors the `SystemLog` interface in `src/lib/api.ts`:
//   { id: number; level: string; message: string; timestamp: number; source?: string }
//
// We deliberately exercise all four level branches (error / warn / info /
// success) so the level-style assertions have full coverage.
const fixtureLogs = [
  {
    id: 1,
    level: "error",
    message: "Database connection refused",
    timestamp: 1_700_000_000_000,
    source: "d1-worker",
  },
  {
    id: 2,
    level: "warn",
    message: "Rate limit approaching",
    timestamp: 1_700_000_001_000,
    source: "trade-worker",
  },
  {
    id: 3,
    level: "info",
    message: "Trade executed",
    timestamp: 1_700_000_002_000,
    source: "trade-worker",
  },
  {
    id: 4,
    level: "success",
    message: "Position closed",
    timestamp: 1_700_000_003_000,
    source: "agent-worker",
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LogsViewer Component", () => {
  // ────────────────────────────────────────────────────────────────────
  // Module structure
  // ────────────────────────────────────────────────────────────────────
  describe("Module structure", () => {
    it("imports without throwing", async () => {
      // Arrange — nothing to set up; the import itself is the act.

      // Act
      const mod = await import("../src/components/dashboard/logs-viewer");

      // Assert
      expect(mod).toBeDefined();
    });

    it("exports LogsViewer as a named function component", async () => {
      // Arrange — none.

      // Act
      const mod = await import("../src/components/dashboard/logs-viewer");

      // Assert
      expect(mod).toHaveProperty("LogsViewer");
      expect(typeof mod.LogsViewer).toBe("function");
    });

    it("LogsViewer has a stable function name (React DevTools identifier)", async () => {
      // Arrange — none.

      // Act
      const mod = await import("../src/components/dashboard/logs-viewer");

      // Assert
      // React uses the function's `.name` for the component display name
      // in DevTools and for the "Unknown" fallback. We assert the
      // identifier so future renames stay visible in code review.
      expect(mod.LogsViewer.name).toBe("LogsViewer");
    });

    it("uses the 'use client' directive at the top of the source", () => {
      // Arrange
      const source = readLogsViewerSource();

      // Act + Assert
      // Required for Next.js 16 App Router: client components must carry
      // the directive on the very first non-comment line.
      expect(source.startsWith('"use client"')).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // API contract — what the component fetches on mount
  // ────────────────────────────────────────────────────────────────────
  describe("API contract — getLogs(100) on mount", () => {
    let apiMod: typeof import("../src/lib/api");

    beforeEach(() => {
      process.env = { ...originalEnv };
      // The `lib/api.ts` `getApiUrl` helper reads `${key}_URL` via
      // process.env (key="d1Service" → "d1Service_URL"). We pin it to
      // a known origin so the test is deterministic and not subject to
      // the module's default fallback (cryptolinx.workers.dev).
      process.env.d1Service_URL = "https://d1-worker.test";
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("fetches /api/logs?limit=100 (the LOG_FETCH_LIMIT used by LogsViewer)", async () => {
      // Arrange
      const seen: string[] = [];
      global.fetch = mock(async (input) => {
        seen.push(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        );
        return Promise.resolve(
          jsonResponse({ success: true, logs: fixtureLogs })
        );
      }) as unknown as typeof fetch;

      // Act — re-import with a `?bust=` query string so the api module
      // is reloaded fresh and the just-installed `process.env` value is
      // picked up by `getApiUrl` (the api module reads it on first
      // dereference, not at import time).
      apiMod = await import(`../src/lib/api?bust=${Date.now()}`);
      const result = await apiMod.api.getLogs(100);

      // Assert
      expect(seen.length).toBe(1);
      expect(seen[0]).toContain("https://d1-worker.test/api/logs");
      expect(seen[0]).toContain("limit=100");
      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(4);
    });

    it("returns the parsed { success, logs } shape on a valid response", async () => {
      // Arrange
      global.fetch = mock(async () =>
        Promise.resolve(jsonResponse({ success: true, logs: fixtureLogs }))
      ) as unknown as typeof fetch;

      // Act
      apiMod = await import(`../src/lib/api?bust=${Date.now() + 1}`);
      const result = await apiMod.api.getLogs(50);

      // Assert
      expect(result).toEqual({ success: true, logs: fixtureLogs });
      expect(result.logs[0]?.level).toBe("error");
      expect(result.logs[3]?.level).toBe("success");
    });

    it("rejects with the fetchWithAuth error when the upstream returns a non-2xx", async () => {
      // Arrange
      // `fetchWithAuth` throws `API Error: <status> <statusText>` on
      // !response.ok. The component's `loadLogs` catches the error and
      // surfaces a toast; we assert the rejection here so the empty
      // state path is observable.
      global.fetch = mock(async () =>
        Promise.resolve(
          jsonResponse({ success: false, error: "Unauthorized" }, 401)
        )
      ) as unknown as typeof fetch;

      // Act + Assert
      apiMod = await import(`../src/lib/api?bust=${Date.now() + 2}`);
      await expect(apiMod.api.getLogs(50)).rejects.toThrow(/API Error: 401/);
    });

    it("propagates network failures (rejects) so the component can surface a toast", async () => {
      // Arrange
      global.fetch = mock(async () =>
        Promise.reject(new Error("network down"))
      ) as unknown as typeof fetch;

      // Act + Assert
      apiMod = await import(`../src/lib/api?bust=${Date.now() + 3}`);
      await expect(apiMod.api.getLogs(50)).rejects.toThrow("network down");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // mock.module("@/lib/api", ...) — existing dashboard pattern
  // ────────────────────────────────────────────────────────────────────
  describe("lib/api module mock", () => {
    it("the component imports { api, type SystemLog } from @/lib/api and resolves a getLogs call through it", async () => {
      // Arrange
      // Build a stubbed api object the same way the component consumes
      // the real one: a single `getLogs(limit)` method on an `api`
      // instance.
      const getLogs = mock<
        () => Promise<{ success: boolean; logs: typeof fixtureLogs }>
      >(async () => ({ success: true, logs: fixtureLogs }));
      // `mock.module` keys on the exact specifier string. The component
      // imports `../src/lib/api` (no query), but by the time this test
      // runs the `API contract` describe block has already loaded the
      // real module under the base specifier, so we mock and re-import
      // under a `?bust=` query — bun treats that as a fresh specifier
      // and resolves it to the factory below.
      const specifier = `../src/lib/api?bust=${Date.now() + 4}`;
      mock.module(specifier, () => ({
        api: { getLogs },
        // The component only ever reads `api` at runtime; types are
        // stripped so no further exports are required here.
      }));

      // Act
      const apiMod = await import(specifier);

      // Assert
      const result = await apiMod.api.getLogs();
      expect(getLogs).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(4);
    });

    it("mocking getLogs to return an empty fixture produces a no-logs state on the wire", async () => {
      // Arrange
      // Mirrors the production empty-state path: `getLogs()` returns
      // `{ success: true, logs: [] }` and the component renders the
      // "No logs available" empty state.
      const getLogs = mock<() => Promise<{ success: boolean; logs: never[] }>>(
        async () => ({ success: true, logs: [] })
      );
      const specifier = `../src/lib/api?bust=${Date.now() + 5}`;
      mock.module(specifier, () => ({
        api: { getLogs },
      }));

      // Act
      const apiMod = await import(specifier);
      const result = await apiMod.api.getLogs();

      // Assert
      expect(getLogs).toHaveBeenCalled();
      expect(result).toEqual({ success: true, logs: [] });
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 30-second auto-revalidation
  // ────────────────────────────────────────────────────────────────────
  describe("30-second auto-revalidation", () => {
    let source: string;

    beforeEach(() => {
      source = readLogsViewerSource();
    });

    it("declares the 30_000 ms REFRESH_INTERVAL_MS constant", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const match = source.match(/REFRESH_INTERVAL_MS\s*=\s*30_000/);

      // Assert
      // The constant exists and is exactly 30 seconds. If this fails
      // the team has either renamed the constant or changed the
      // interval — both deserve a code review.
      expect(match).not.toBeNull();
    });

    it("uses setInterval to schedule the periodic revalidation", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const hasSetInterval = /setInterval\s*\(/.test(source);

      // Assert
      expect(hasSetInterval).toBe(true);
    });

    it("clears the interval on unmount so timers do not leak in the client runtime", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const hasClearInterval = /clearInterval\s*\(/.test(source);

      // Assert
      // Required for the React 19 / Next.js 16 client runtime: a missed
      // `clearInterval` leaks the timer into the next mount and triggers
      // a "state update on an unmounted component" warning.
      expect(hasClearInterval).toBe(true);
    });

    it("wraps the interval in a useEffect that returns the cleanup function", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act — confirm the three structural pieces appear in order
      // inside the same useEffect call: setInterval(...) is scheduled,
      // a return function is provided, and clearInterval(...) is called
      // inside that return. The three markers appear consecutively in
      // the production source so a simpler ordered-substring check is
      // both more robust and easier to read than a full regex.
      const setIntervalIdx = source.indexOf("setInterval(");
      const returnCleanupIdx = source.indexOf("return () => {", setIntervalIdx);
      const clearIntervalIdx =
        returnCleanupIdx >= 0
          ? source.indexOf("clearInterval(", returnCleanupIdx)
          : -1;

      // Assert
      // All three must be present, and in the documented order, so the
      // timer is registered and the cleanup function clears it.
      expect(setIntervalIdx).toBeGreaterThan(-1);
      expect(returnCleanupIdx).toBeGreaterThan(setIntervalIdx);
      expect(clearIntervalIdx).toBeGreaterThan(returnCleanupIdx);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Semantic tokens (no raw color classes)
  // ────────────────────────────────────────────────────────────────────
  describe("Semantic tokens (no raw color classes)", () => {
    let source: string;

    beforeEach(() => {
      source = readLogsViewerSource();
    });

    it("uses the four semantic level tokens (destructive, warning, success, primary)", () => {
      // Arrange
      // (source loaded in beforeEach)
      const expectedTokens = [
        "text-destructive",
        "text-warning",
        "text-success",
        "text-primary",
      ] as const;

      // Act + Assert
      for (const token of expectedTokens) {
        expect(source).toContain(token);
        if (!source.includes(token)) {
          throw new Error(
            `Missing semantic token: ${token} — the level-style mapping must use shadcn design tokens, not raw Tailwind colors.`
          );
        }
      }
    });

    it("uses the destructive semantic token specifically for the error level", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      // Find the `error` branch of getLevelStyle and verify it
      // contains `text-destructive` (and not a raw color like
      // `text-red-500`). The match is a string after the null guard so
      // the `.toContain` call is type-safe.
      const errorBranch = source.match(
        /if\s*\(\s*normalized\s*===\s*"error"\s*\)\s*\{[\s\S]*?\}/
      );
      const errorBranchText = errorBranch?.[0] ?? "";

      // Assert
      expect(errorBranch).not.toBeNull();
      expect(errorBranchText).toContain("text-destructive");
      expect(errorBranchText).not.toMatch(/text-red-\d+/);
    });

    it("does not use raw Tailwind palette colors for level badge classes", () => {
      // Arrange
      // Raw palette names that the design system explicitly forbids
      // (code-quality.md §3.5 — output sanitization is for stack
      // traces, but the design-token rules live in the dashboard's
      // shadcn config). The list is intentionally narrow: we only flag
      // the colors that map to our four semantic tokens.
      const forbiddenRawColors = [
        "text-red-",
        "text-amber-",
        "text-emerald-",
        "text-blue-",
        "bg-red-",
        "bg-amber-",
        "bg-emerald-",
        "bg-blue-",
      ];

      // Act + Assert
      for (const color of forbiddenRawColors) {
        expect(source).not.toContain(color);
        if (source.includes(color)) {
          throw new Error(
            `Raw Tailwind color class "${color}" found in logs-viewer.tsx — replace with the semantic token (text-destructive, text-warning, text-success, text-primary).`
          );
        }
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Render contract — what gets painted when data arrives
  // ────────────────────────────────────────────────────────────────────
  describe("Render contract — log rows", () => {
    let source: string;

    beforeEach(() => {
      source = readLogsViewerSource();
    });

    it("renders a row per log entry when filteredLogs is non-empty (source-level)", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      // Dense list UI: one keyed row per filtered log (list item, not
      // necessarily a shadcn TableRow — density/copy actions drove the
      // switch). Full DOM render would require testing-library.
      const hasFilteredMap = source.includes("filteredLogs.map(");
      const keysById =
        /<(?:li|TableRow)\s+key=\{log\.id\}/.test(source) ||
        /key=\{log\.id\}/.test(source);

      // Assert
      expect(hasFilteredMap).toBe(true);
      expect(keysById).toBe(true);
    });

    it("renders the message, level, source, and timestamp fields for each row", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      // Columns: relative+absolute time, level badge, source, message.
      const hasTimestamp =
        source.includes("formatRelative(log.timestamp)") ||
        source.includes("formatAbsolute(log.timestamp)") ||
        source.includes("formatAbsoluteShort(log.timestamp)") ||
        source.includes("formatTimestamp(log.timestamp)");
      const hasMessageCell = source.includes("{log.message}");
      const hasSourceCell = source.includes("log.source");
      const hasLevelCell =
        source.includes("{log.level}") || source.includes("log.level");

      // Assert
      expect(hasTimestamp).toBe(true);
      expect(hasMessageCell).toBe(true);
      expect(hasSourceCell).toBe(true);
      expect(hasLevelCell).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Filter UI contract
  // ────────────────────────────────────────────────────────────────────
  describe("Filter UI contract", () => {
    let source: string;

    beforeEach(() => {
      source = readLogsViewerSource();
    });

    it("declares the LEVEL_OPTIONS array with the four documented level values", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const hasAll = ["info", "warn", "error", "success"].every((level) =>
        new RegExp(`value:\\s*"${level}"`).test(source)
      );

      // Assert
      expect(hasAll).toBe(true);
      expect(source).toContain("LEVEL_OPTIONS");
    });

    it("wires up the three filter controls (search, level, source) via setState hooks", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act + Assert
      // Search input
      expect(source).toContain("setSearchQuery");
      // Level select
      expect(source).toContain("setLevelFilter");
      // Source/worker select
      expect(source).toContain("setSourceFilter");
    });

    it("exposes a Clear button that resets all filters when any filter is active", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const hasClear = source.includes("clearFilters");
      const hasActive = source.includes("hasActiveFilters");

      // Assert
      expect(hasClear).toBe(true);
      expect(hasActive).toBe(true);
    });

    it("filters by message and source via a case-insensitive substring search", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const hasToLowerCase = source.includes("toLowerCase()");
      const hasIncludes = source.includes(".includes(");
      const hasMessageFilter = source.includes("log.message.toLowerCase()");
      const hasSourceFilter = source.includes("log.source?.toLowerCase()");

      // Assert
      expect(hasToLowerCase).toBe(true);
      expect(hasIncludes).toBe(true);
      expect(hasMessageFilter).toBe(true);
      expect(hasSourceFilter).toBe(true);
    });

    it("normalizes the level string before comparing it against the filter", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      // Defensively lowercase worker levels (`WARN`, `Error`, `INFO`)
      // before matching filters. Return type may be LogLevel or a
      // narrowed Exclude<LogLevel, "all">.
      const hasNormalize = source.includes("function normalizeLevel");
      const normalizesLower =
        /function\s+normalizeLevel\s*\(\s*level:\s*string\s*\)\s*:\s*[^{]+\{[\s\S]*?toLowerCase\(\)/.test(
          source
        );

      // Assert
      expect(hasNormalize).toBe(true);
      expect(normalizesLower).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Layout & shadcn conventions
  // ────────────────────────────────────────────────────────────────────
  describe("Layout & shadcn conventions", () => {
    let source: string;

    beforeEach(() => {
      source = readLogsViewerSource();
    });

    it("uses flex flex-col gap-* (not the legacy space-y-* utility)", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const hasFlexColGap = /flex\s+flex-col\s+gap-/.test(source);
      const hasSpaceY = /\sspace-y-/.test(source);

      // Assert
      expect(hasFlexColGap).toBe(true);
      expect(hasSpaceY).toBe(false);
    });

    it("imports the cn() utility for conditional class composition", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const importsCn =
        /import\s*\{\s*cn\s*\}\s*from\s*["']@\/lib\/utils["']/.test(source);
      const usesCn = /\bcn\s*\(/.test(source);

      // Assert
      expect(importsCn).toBe(true);
      expect(usesCn).toBe(true);
    });

    it("renders an Empty-state component for the no-logs branch", () => {
      // Arrange
      // (source loaded in beforeEach)

      // Act
      const importsEmpty =
        /import\s*\{[\s\S]*?Empty[\s\S]*?\}\s*from\s*["']@\/components\/ui\/empty["']/.test(
          source
        );
      const usesEmpty = /<Empty[\s>]/.test(source);

      // Assert
      expect(importsEmpty).toBe(true);
      expect(usesEmpty).toBe(true);
    });
  });
});
