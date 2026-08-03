/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure percentile / summary statistics. No I/O, no logging.
 * Uses linear interpolation between ranks (numpy "linear" default).
 */

export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  if (q < 0 || q > 1) {
    throw new Error(`percentile q must be in [0, 1], got ${q}`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = q * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stddev(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  let variance = 0;
  for (const v of values) {
    const d = v - m;
    variance += d * d;
  }
  return Math.sqrt(variance / values.length);
}

export interface Summary {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: mean(values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  };
}
