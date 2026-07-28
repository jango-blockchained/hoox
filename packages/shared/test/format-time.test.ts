/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { formatRelativeTime, formatDuration } from "../src/format-time";

describe("format-time", () => {
  describe("formatRelativeTime", () => {
    it("formats relative times correctly", () => {
      const now = 1000000000;
      expect(formatRelativeTime(now - 30000, now)).toBe("< 1m ago");
      expect(formatRelativeTime(now - 120000, now)).toBe("2m ago");
      expect(formatRelativeTime(now - 7200000, now)).toBe("2h ago");
      expect(formatRelativeTime(now - 172800000, now)).toBe("2d ago");
      expect(formatRelativeTime(now - 3000000000, now)).toBe("> 30d ago");
    });

    it("handles future times and zero", () => {
      const now = 1000000000;
      expect(formatRelativeTime(now + 10000, now)).toBe("just now");
      expect(formatRelativeTime(0, now)).toBe("—");
    });
  });

  describe("formatDuration", () => {
    it("formats durations correctly", () => {
      expect(formatDuration(45000)).toBe("45s");
      expect(formatDuration(120000)).toBe("2m");
      expect(formatDuration(150000)).toBe("2m 30s");
      expect(formatDuration(7200000)).toBe("2h");
      expect(formatDuration(7380000)).toBe("2h 3m");
    });
  });
});
