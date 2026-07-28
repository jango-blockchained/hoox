/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { percentile, mean, stddev, summarize } from "./percentile.js";

describe("percentile", () => {
  it("returns 0 for empty input", () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it("returns the only value for n=1", () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.95)).toBe(42);
  });

  it("computes p50 of [1,2,3,4,5]", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("computes p95 of [1..100]", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    // Linear interpolation: index = 0.95 * (100-1) = 94.05
    // value = values[94] + 0.05 * (values[95] - values[94]) = 95 + 0.05 = 95.05
    expect(percentile(values, 0.95)).toBeCloseTo(95.05, 5);
  });

  it("returns the same value for identical inputs", () => {
    expect(percentile([7, 7, 7, 7], 0.5)).toBe(7);
    expect(percentile([7, 7, 7, 7], 0.99)).toBe(7);
  });

  it("does not mutate the input array", () => {
    const values = [3, 1, 2];
    const before = [...values];
    percentile(values, 0.5);
    expect(values).toEqual(before);
  });
});

describe("mean", () => {
  it("returns 0 for empty input", () => {
    expect(mean([])).toBe(0);
  });

  it("computes the arithmetic mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
});

describe("stddev", () => {
  it("returns 0 for empty or single-value input", () => {
    expect(stddev([])).toBe(0);
    expect(stddev([5])).toBe(0);
  });

  it("computes population standard deviation", () => {
    // [2,4,4,4,5,5,7,9] has stddev 2 exactly
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });
});

describe("summarize", () => {
  it("produces all required fields", () => {
    const s = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.count).toBe(10);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
    expect(s.mean).toBe(5.5);
    expect(s.p50).toBe(5.5);
    expect(s.p95).toBeCloseTo(9.55, 2);
    expect(s.p99).toBeCloseTo(9.91, 2);
  });

  it("returns zeros for empty input", () => {
    const s = summarize([]);
    expect(s.count).toBe(0);
    expect(s.mean).toBe(0);
    expect(s.p50).toBe(0);
  });
});
