/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `hoox check` command types — validation check results, health status,
 * and fix reports for the check command group.
 */

/**
 * Result of a single validation check within a category.
 */
export interface CheckResult {
  /** Human-readable check name (e.g. "D1 Database", "Wrangler Configs"). */
  name: string;
  /** Whether this check passed (no errors). */
  success: boolean;
  /** Failing conditions — must be addressed before deployment. */
  errors: string[];
  /** Non-blocking issues — should be reviewed. */
  warnings: string[];
}

/**
 * A logical group of related checks (Config, Infrastructure, Secrets, Database).
 */
export interface CheckCategory {
  /** Category label displayed in the report. */
  name: string;
  /** Per-check results within this category. */
  checks: CheckResult[];
}

/**
 * Top-level report produced by `hoox check setup`.
 * Rendered as a table (human mode) or JSON (--json mode).
 */
export interface CheckReport {
  /** True when every check in every category passed (zero errors). */
  success: boolean;
  /** Grouped category results. */
  categories: CheckCategory[];
  /** Aggregated counts across all checks. */
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

// ---------------------------------------------------------------------------
// Health check types
// ---------------------------------------------------------------------------

/**
 * Status of a single worker after a health probe.
 */
export interface HealthCheckResult {
  /** Worker name as defined in wrangler.jsonc. */
  worker: string;
  /** Categorised health status. */
  status: "healthy" | "degraded" | "down";
  /** Whether the worker's HTTP /health endpoint was reachable. */
  connectivity: boolean;
  /** HTTP probe round-trip time in ms (if measurable). */
  responseTime?: number;
  /** URL that was probed (when available). */
  url?: string;
  /** Human-readable error when status is "degraded" or "down". */
  error?: string;
}

// ---------------------------------------------------------------------------
// Fix / repair types
// ---------------------------------------------------------------------------

/**
 * A single fix action to be applied (or simulated in --dry-run) by `hoox check fix`.
 */
export interface FixAction {
  description: string;
  type: "file" | "binding" | "flag" | "config";
  /** Target path or identifier (e.g. worker path, binding name). */
  target: string;
  /** Textual description of the exact change to apply. */
  change: string;
  /** Whether the fix was successfully applied (always false in --dry-run). */
  applied: boolean;
  /** Error message if application failed. */
  error?: string;
}

/**
 * Report produced by `hoox check fix` summarising all fix actions.
 */
export interface FixReport {
  /** Ordered list of fix actions. */
  actions: FixAction[];
  /** Whether this was a dry-run (no filesystem writes). */
  dryRun: boolean;
  /** Aggregated counts. */
  summary: {
    total: number;
    applied: number;
    skipped: number;
    failed: number;
  };
}
