/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { formatNumber, formatBytes } from "./number.js";

describe("formatNumber", () => {
  it("returns '0' for zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("returns signed value for negatives", () => {
    expect(formatNumber(-42)).toBe("-42");
  });

  it("formats negative scaled values with K/M/B suffix", () => {
    expect(formatNumber(-1_000)).toBe("-1.0K");
    expect(formatNumber(-1_234)).toBe("-1.2K");
    expect(formatNumber(-12_345)).toBe("-12K");
    expect(formatNumber(-1_000_000)).toBe("-1.0M");
    expect(formatNumber(-2_500_000_000)).toBe("-2.5B");
  });

  it("returns plain integer for values under 1000", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(123)).toBe("123");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1_000)).toBe("1.0K");
    expect(formatNumber(1_234)).toBe("1.2K");
    expect(formatNumber(12_345)).toBe("12K");
    expect(formatNumber(999_499)).toBe("999K");
  });

  it("formats millions with M suffix", () => {
    expect(formatNumber(1_000_000)).toBe("1.0M");
    expect(formatNumber(1_500_000)).toBe("1.5M");
    expect(formatNumber(2_500_000_000)).toBe("2.5B");
  });

  it("returns '-' for non-finite input", () => {
    expect(formatNumber(Number.NaN)).toBe("-");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("-");
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe("-");
  });
});

describe("formatBytes", () => {
  it("returns '0 B' for zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats decimal units by default", () => {
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(1_500_000)).toBe("1.5 MB");
  });

  it("formats binary units when { binary: true }", () => {
    expect(formatBytes(1_024, { binary: true })).toBe("1.0 KiB");
    expect(formatBytes(1_572_864, { binary: true })).toBe("1.5 MiB");
    expect(formatBytes(1_610_612_736, { binary: true })).toBe("1.5 GiB");
  });

  it("returns '-' for non-finite input", () => {
    expect(formatBytes(Number.NaN)).toBe("-");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("-");
  });
});
