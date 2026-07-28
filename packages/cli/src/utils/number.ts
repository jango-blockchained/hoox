/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Number / byte formatters for human-readable terminal output.
 *
 * Pure, dependency-free. Used by `formatTable` (number auto-alignment) and
 * directly by `hoox perf fastpath` / `hoox monitor status` / `hoox trace metrics`.
 */

/**
 * Format a number using the en-US "compact" notation:
 *   0       → "0"
 *   999     → "999"
 *   1_000   → "1.0K"
 *   1_234   → "1.2K"
 *   12_345  → "12K"
 *   999_499 → "999K"
 *   1_000_000 → "1.0M"
 *   1_500_000 → "1.5M"
 *   2_500_000_000 → "2.5B"
 *
 * Rounding rule: scaled values in [1, 10) get one decimal; scaled values
 * in [10, 1000) get zero decimals. This keeps "1.2K" / "1.0M" / "2.5B"
 * precise while avoiding "12.3K" / "999.5K" noise.
 *
 * Non-finite input returns "-".
 *
 * Implementation note: Intl.NumberFormat with `notation: "compact"` and
 * `maximumFractionDigits: 1` was considered but does NOT produce the
 * required outputs — it yields "1K" (not "1.0K") for exact powers of 10
 * and "12.3K" / "999.5K" for the higher-magnitude cases. Manual logic
 * (mirroring `formatBytes` below) matches the test expectations.
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) < 1000) return String(n);

  const abs = Math.abs(n);

  // Pick the largest unit whose threshold the magnitude reaches.
  let unit: string;
  let divisor: number;
  if (abs >= 1e12) {
    unit = "T";
    divisor = 1e12;
  } else if (abs >= 1e9) {
    unit = "B";
    divisor = 1e9;
  } else if (abs >= 1e6) {
    unit = "M";
    divisor = 1e6;
  } else {
    unit = "K";
    divisor = 1e3;
  }

  // scaled / Math.round(scaled) already carry the sign of n.
  const scaled = n / divisor;
  const formatted =
    Math.abs(scaled) < 10 ? scaled.toFixed(1) : String(Math.round(scaled));

  return `${formatted}${unit}`;
}

/**
 * Format a byte count as a human-readable string.
 *
 * By default uses decimal (SI) units:   KB, MB, GB (powers of 1000).
 * With `{ binary: true }` uses binary:   KiB, MiB, GiB (powers of 1024).
 *
 * Non-finite input returns "-".
 */
export function formatBytes(n: number, opts?: { binary?: boolean }): string {
  if (!Number.isFinite(n)) return "-";

  const base = opts?.binary ? 1024 : 1000;
  const units = opts?.binary
    ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
    : ["B", "KB", "MB", "GB", "TB", "PB"];

  if (n === 0) return "0 B";

  // Use log of absolute value so negatives format sensibly.
  const abs = Math.abs(n);
  const i = Math.min(
    Math.floor(Math.log(abs) / Math.log(base)),
    units.length - 1
  );
  const value = n / Math.pow(base, i);

  // 0 decimals for the B unit itself, 0 decimals for scaled values >= 100,
  // and 1 decimal otherwise. We use 1 decimal (not 2) so that an exact
  // scaled value like 1.0 stays as "1.0" rather than "1.00" (which would
  // then trim down to "1" and lose the unit precision).
  const formatted =
    i === 0 ? String(value) : value.toFixed(value >= 100 ? 0 : 1);

  return `${formatted} ${units[i]}`;
}
