/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tiny timer + duration formatting helpers.
 *
 * Used to stamp "took 4.2s" on completion lines throughout the CLI
 * (deploy, check, setup, infra, db, etc.).
 */

/** Human-readable duration formatter. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Start a timer; `.ms()` reads elapsed milliseconds, `.format()` renders it. */
export function startTimer(): { ms: () => number; format: () => string } {
  const startedAt = Date.now();
  return {
    ms: () => Date.now() - startedAt,
    format: () => formatDuration(Date.now() - startedAt),
  };
}
