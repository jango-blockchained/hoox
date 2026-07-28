/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  formatNumber,
  formatCurrency,
  formatCompactCurrency,
  formatDuration,
  formatDurationCompact,
  formatTimestamp,
  formatRelativeTime,
  formatPercent,
  formatUptime,
  formatLatency,
  formatRequests,
  formatMemory,
  formatCpu,
} from "../src/formatters";

describe("formatters", () => {
  describe("formatNumber", () => {
    it("formats large numbers with suffixes", () => {
      expect(formatNumber(1500)).toBe("1.5K");
      expect(formatNumber(2500000)).toBe("2.5M");
      expect(formatNumber(3500000000)).toBe("3.5B");
    });
    it("formats small numbers normally", () => {
      expect(formatNumber(500)).toBe("500");
    });
    it("handles non-finite numbers", () => {
      expect(formatNumber(NaN)).toBe("—");
      expect(formatNumber(Infinity)).toBe("—");
    });
  });

  describe("formatCurrency", () => {
    it("formats currency with signs and suffixes", () => {
      expect(formatCurrency(1500)).toBe("+$1.50K");
      expect(formatCurrency(-2500000)).toBe("-$2.50M");
      expect(formatCurrency(500)).toBe("+$500.00");
      expect(formatCurrency(-500)).toBe("-$500.00");
    });
    it("handles non-finite numbers", () => {
      expect(formatCurrency(NaN)).toBe("—");
    });
  });

  describe("formatCompactCurrency", () => {
    it("formats compact currency without positive sign", () => {
      expect(formatCompactCurrency(1500)).toBe("$1.50K");
      expect(formatCompactCurrency(-2500000)).toBe("-$2.50M");
      expect(formatCompactCurrency(500)).toBe("$500.00");
      expect(formatCompactCurrency(-500)).toBe("-$500.00");
    });
    it("handles non-finite numbers", () => {
      expect(formatCompactCurrency(NaN)).toBe("—");
    });
  });

  describe("formatDuration", () => {
    it("formats seconds into human readable strings", () => {
      expect(formatDuration(45)).toBe("45s");
      expect(formatDuration(125)).toBe("2m 5s");
      expect(formatDuration(3665)).toBe("1h 1m 5s");
      expect(formatDuration(90065)).toBe("1d 1h 1m 5s");
    });
    it("handles invalid inputs", () => {
      expect(formatDuration(-10)).toBe("—");
      expect(formatDuration(NaN)).toBe("—");
    });
  });

  describe("formatDurationCompact", () => {
    it("formats seconds into compact strings", () => {
      expect(formatDurationCompact(45)).toBe("45s");
      expect(formatDurationCompact(125)).toBe("2m");
      expect(formatDurationCompact(3665)).toBe("1h 1m");
      expect(formatDurationCompact(90065)).toBe("1d 1h");
    });
    it("handles invalid inputs", () => {
      expect(formatDurationCompact(-10)).toBe("—");
      expect(formatDurationCompact(NaN)).toBe("—");
    });
  });

  describe("formatTimestamp", () => {
    it("formats valid ISO strings", () => {
      const iso = "2023-01-01T12:34:56Z";
      expect(formatTimestamp(iso)).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
    it("returns original string for invalid dates", () => {
      expect(formatTimestamp("invalid")).toBe("invalid");
    });
  });

  describe("formatRelativeTime", () => {
    it("formats relative times", () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 30000)).toBe("30s ago");
      expect(formatRelativeTime(now - 120000)).toBe("2m ago");
      expect(formatRelativeTime(now - 7200000)).toBe("2h ago");
      expect(formatRelativeTime(now - 172800000)).toBe("2d ago");
      expect(formatRelativeTime(now + 10000)).toBe("just now");
    });
  });

  describe("formatPercent", () => {
    it("formats percentages", () => {
      expect(formatPercent(12.345)).toBe("+12.35%");
      expect(formatPercent(-12.345)).toBe("-12.35%");
      expect(formatPercent(12.345, 1)).toBe("+12.3%");
    });
    it("handles non-finite numbers", () => {
      expect(formatPercent(NaN)).toBe("—");
    });
  });

  describe("formatUptime", () => {
    it("formats uptime", () => {
      expect(formatUptime(125)).toBe("2m 5s");
    });
  });

  describe("formatLatency", () => {
    it("formats latency", () => {
      expect(formatLatency(0.5)).toBe("<1ms");
      expect(formatLatency(500)).toBe("500ms");
      expect(formatLatency(1500)).toBe("1.5s");
    });
    it("handles non-finite numbers", () => {
      expect(formatLatency(NaN)).toBe("—");
    });
  });

  describe("formatRequests", () => {
    it("formats requests", () => {
      expect(formatRequests(1500)).toBe("1.5K");
    });
  });

  describe("formatMemory", () => {
    it("formats memory", () => {
      expect(formatMemory(128.5, 256)).toBe("129/256 MB");
    });
  });

  describe("formatCpu", () => {
    it("formats cpu", () => {
      expect(formatCpu(12.34)).toBe("12.3ms");
    });
    it("handles non-finite numbers", () => {
      expect(formatCpu(NaN)).toBe("—");
    });
  });
});
