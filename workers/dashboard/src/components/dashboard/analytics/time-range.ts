/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

export type TimeRangeKey = "24h" | "7d" | "30d" | "90d" | "all";

export const TIME_RANGE_OPTIONS: ReadonlyArray<{
  value: TimeRangeKey;
  label: string;
  shortLabel: string;
}> = [
  { value: "24h", label: "Last 24 hours", shortLabel: "24h" },
  { value: "7d", label: "Last 7 days", shortLabel: "7d" },
  { value: "30d", label: "Last 30 days", shortLabel: "30d" },
  { value: "90d", label: "Last 90 days", shortLabel: "90d" },
  { value: "all", label: "All time", shortLabel: "All" },
] as const;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const RANGE_MS: Record<Exclude<TimeRangeKey, "all">, number> = {
  "24h": 24 * MS_PER_HOUR,
  "7d": 7 * MS_PER_DAY,
  "30d": 30 * MS_PER_DAY,
  "90d": 90 * MS_PER_DAY,
};

export function timeRangeLabel(range: TimeRangeKey): string {
  return (
    TIME_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "Selected range"
  );
}

/** Lower-bound ISO timestamp, or undefined for all-time. */
export function timeRangeToStartIso(range: TimeRangeKey): string | undefined {
  if (range === "all") return undefined;
  return new Date(Date.now() - RANGE_MS[range]).toISOString();
}

/** Append start/end (or timeRange) query params for analytics API routes. */
export function appendTimeRangeParams(
  url: URL,
  range: TimeRangeKey,
  options?: { end?: boolean }
): URL {
  const start = timeRangeToStartIso(range);
  if (start) {
    url.searchParams.set("start", start);
    // Legacy param still accepted by some handlers.
    url.searchParams.set("timeRange", start);
  }
  if (options?.end !== false) {
    url.searchParams.set("end", new Date().toISOString());
  }
  return url;
}

export function isTimeRangeKey(value: string): value is TimeRangeKey {
  return TIME_RANGE_OPTIONS.some((o) => o.value === value);
}
