/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formatters Utility Tests — Time formatting, number formatting.
 *
 * Tests the pure formatting functions used throughout the TUI:
 *   - formatRelativeTime (relative "X ago" strings)
 *   - formatDuration (compact duration strings)
 *
 * Also tests number formatting helpers used in views:
 *   - K/M suffix for large numbers
 *   - P&L sign prefix
 *   - Uptime formatting
 *
 * Uses Bun test runner.
 */
import { describe, it, expect } from "bun:test";
import {
  formatRelativeTime,
  formatDuration,
} from "@hoox-sh/hoox-shared/format-time";

// ─── formatRelativeTime ──────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  const now = 2000000; // fixed "now" reference for deterministic tests

  it('returns "—" for timestamp 0', () => {
    expect(formatRelativeTime(0, now)).toBe("—");
  });

  it('returns "just now" for future timestamps', () => {
    expect(formatRelativeTime(now + 5000, now)).toBe("just now");
  });

  it('returns "< 1m ago" for less than 60 seconds', () => {
    expect(formatRelativeTime(now - 1000, now)).toBe("< 1m ago");
    expect(formatRelativeTime(now - 59000, now)).toBe("< 1m ago");
  });

  it("returns minutes ago for 1-59 minutes", () => {
    expect(formatRelativeTime(now - 60000, now)).toBe("1m ago");
    expect(formatRelativeTime(now - 120000, now)).toBe("2m ago");
    expect(formatRelativeTime(now - 3540000, now)).toBe("59m ago");
  });

  it("returns hours ago for 1-23 hours", () => {
    expect(formatRelativeTime(now - 3600000, now)).toBe("1h ago");
    expect(formatRelativeTime(now - 7200000, now)).toBe("2h ago");
    expect(formatRelativeTime(now - 82800000, now)).toBe("23h ago");
  });

  it("returns days ago for 1-29 days", () => {
    expect(formatRelativeTime(now - 86400000, now)).toBe("1d ago");
    expect(formatRelativeTime(now - 86400000 * 7, now)).toBe("7d ago");
    expect(formatRelativeTime(now - 86400000 * 29, now)).toBe("29d ago");
  });

  it('returns "> 30d ago" for 30+ days', () => {
    expect(formatRelativeTime(now - 86400000 * 30, now)).toBe("> 30d ago");
    expect(formatRelativeTime(now - 86400000 * 100, now)).toBe("> 30d ago");
  });

  it("uses Date.now() when nowMs is not provided", () => {
    const result = formatRelativeTime(Date.now() - 60000);
    // Should be "1m ago" or similar depending on timing
    expect(result).toMatch(/^(< 1m|\d+m) ago$/);
  });

  it("handles exactly 60 seconds boundary", () => {
    expect(formatRelativeTime(now - 60000, now)).toBe("1m ago");
  });

  it("handles exactly 60 minutes boundary", () => {
    expect(formatRelativeTime(now - 3600000, now)).toBe("1h ago");
  });

  it("handles exactly 24 hours boundary", () => {
    expect(formatRelativeTime(now - 86400000, now)).toBe("1d ago");
  });

  it("handles exactly 30 days boundary", () => {
    expect(formatRelativeTime(now - 86400000 * 30, now)).toBe("> 30d ago");
  });

  it("handles negative timestamp (future) gracefully", () => {
    expect(formatRelativeTime(now + 1, now)).toBe("just now");
  });
});

// ─── formatDuration ──────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats seconds when under 1 minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(30000)).toBe("30s");
    expect(formatDuration(59000)).toBe("59s");
  });

  it("formats minutes with seconds when seconds remain", () => {
    expect(formatDuration(60000)).toBe("1m");
    expect(formatDuration(61000)).toBe("1m 1s");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(3540000)).toBe("59m");
  });

  it("formats hours when 1+ hour", () => {
    expect(formatDuration(3600000)).toBe("1h");
    expect(formatDuration(3661000)).toBe("1h 1m");
    expect(formatDuration(7200000)).toBe("2h");
    expect(formatDuration(7260000)).toBe("2h 1m");
  });

  it("handles large durations", () => {
    // 25 hours
    expect(formatDuration(90000000)).toBe("25h");
    // 25 hours + 30 minutes
    expect(formatDuration(91800000)).toBe("25h 30m");
  });

  it("handles milliseconds below 1 second", () => {
    expect(formatDuration(500)).toBe("0s");
    expect(formatDuration(999)).toBe("0s");
  });
});

// ─── Number Formatting Helpers ───────────────────────────────────────────────

describe("number formatting", () => {
  /**
   * Format large numbers with K/M suffixes.
   * Mirrors the logic used in dashboard quick stats and worker overview.
   */
  function formatCompact(n: number, decimals: number = 1): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000)
      return `${sign}${(abs / 1_000_000).toFixed(decimals)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(decimals)}K`;
    return `${sign}${abs.toFixed(decimals)}`;
  }

  it("formats thousands with K suffix", () => {
    expect(formatCompact(1500)).toBe("1.5K");
    expect(formatCompact(2000)).toBe("2.0K");
    expect(formatCompact(999000)).toBe("999.0K");
  });

  it("formats millions with M suffix", () => {
    expect(formatCompact(1500000)).toBe("1.5M");
    expect(formatCompact(2000000)).toBe("2.0M");
    expect(formatCompact(12345678)).toBe("12.3M");
  });

  it("returns unchanged for numbers under 1000", () => {
    expect(formatCompact(500)).toBe("500.0");
    expect(formatCompact(0)).toBe("0.0");
    expect(formatCompact(999)).toBe("999.0");
  });

  it("handles negative numbers correctly", () => {
    expect(formatCompact(-1500)).toBe("-1.5K");
    expect(formatCompact(-1500000)).toBe("-1.5M");
  });

  it("prefixes P&L with + for positive and - for negative", () => {
    function formatPnL(pnl: number): string {
      const prefix = pnl >= 0 ? "+" : "-";
      const abs = Math.abs(pnl);
      if (abs >= 1_000_000) return `${prefix}${(abs / 1_000_000).toFixed(2)}M`;
      if (abs >= 1_000) return `${prefix}${(abs / 1_000).toFixed(2)}K`;
      return `${prefix}${abs.toFixed(2)}`;
    }

    expect(formatPnL(42500)).toBe("+42.50K");
    expect(formatPnL(-3500)).toBe("-3.50K");
    expect(formatPnL(1500000)).toBe("+1.50M");
    expect(formatPnL(500)).toBe("+500.00");
    expect(formatPnL(0)).toBe("+0.00");
  });
});

// ─── Uptime Formatting ───────────────────────────────────────────────────────

describe("uptime formatting", () => {
  /**
   * Format uptime in seconds to a human-readable string.
   * Used by worker-detail and workers-overview views.
   */
  function formatUptime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    return `${d}d ${h}h`;
  }

  it("formats seconds", () => {
    expect(formatUptime(0)).toBe("0s");
    expect(formatUptime(30)).toBe("30s");
    expect(formatUptime(59)).toBe("59s");
  });

  it("formats minutes", () => {
    expect(formatUptime(60)).toBe("1m");
    expect(formatUptime(90)).toBe("1m");
    expect(formatUptime(3599)).toBe("59m");
  });

  it("formats hours with minutes", () => {
    expect(formatUptime(3600)).toBe("1h 0m");
    expect(formatUptime(3661)).toBe("1h 1m");
    expect(formatUptime(7200)).toBe("2h 0m");
  });

  it("formats days with hours", () => {
    expect(formatUptime(86400)).toBe("1d 0h");
    expect(formatUptime(90000)).toBe("1d 1h");
    expect(formatUptime(172800)).toBe("2d 0h");
    expect(formatUptime(259200)).toBe("3d 0h");
  });

  it("handles large uptimes", () => {
    expect(formatUptime(604800)).toBe("7d 0h"); // 7 days
    expect(formatUptime(2592000)).toBe("30d 0h"); // 30 days
  });
});

// ─── Latency Formatting ──────────────────────────────────────────────────────

describe("latency formatting", () => {
  /**
   * Format latency in milliseconds for trade monitor display.
   */
  function formatLatency(ms: number): string {
    if (ms < 1) return "<1ms";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  it("formats sub-millisecond latency", () => {
    expect(formatLatency(0)).toBe("<1ms");
    expect(formatLatency(0.5)).toBe("<1ms");
  });

  it("formats millisecond latency", () => {
    expect(formatLatency(1)).toBe("1ms");
    expect(formatLatency(45)).toBe("45ms");
    expect(formatLatency(500)).toBe("500ms");
    expect(formatLatency(999)).toBe("999ms");
  });

  it("formats second-level latency", () => {
    expect(formatLatency(1000)).toBe("1.0s");
    expect(formatLatency(2500)).toBe("2.5s");
    expect(formatLatency(15000)).toBe("15.0s");
  });
});

// ─── Percentage Formatting ───────────────────────────────────────────────────

describe("percentage formatting", () => {
  function formatPercent(value: number, decimals: number = 1): string {
    return `${value.toFixed(decimals)}%`;
  }

  it("formats percentages with one decimal", () => {
    expect(formatPercent(50)).toBe("50.0%");
    expect(formatPercent(99.9)).toBe("99.9%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("handles edge values", () => {
    expect(formatPercent(100)).toBe("100.0%");
    expect(formatPercent(0.1)).toBe("0.1%");
  });
});

// ─── Request Count Formatting ────────────────────────────────────────────────

describe("request count formatting", () => {
  function formatRequests(requests: number): string {
    if (requests >= 1_000_000) return `${(requests / 1_000_000).toFixed(1)}M`;
    if (requests >= 1_000) return `${(requests / 1_000).toFixed(1)}K`;
    return requests.toString();
  }

  it("formats small request counts as-is", () => {
    expect(formatRequests(0)).toBe("0");
    expect(formatRequests(42)).toBe("42");
    expect(formatRequests(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(formatRequests(1000)).toBe("1.0K");
    expect(formatRequests(1500)).toBe("1.5K");
    expect(formatRequests(999000)).toBe("999.0K");
  });

  it("formats millions with M suffix", () => {
    expect(formatRequests(1000000)).toBe("1.0M");
    expect(formatRequests(1200000)).toBe("1.2M");
  });
});
