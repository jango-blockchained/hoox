/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { formatDuration, startTimer } from "./timer.js";

describe("formatDuration", () => {
  it("renders sub-second durations as ms", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(1)).toBe("1ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("renders 1–60s durations as seconds with 1 decimal", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(4_200)).toBe("4.2s");
    expect(formatDuration(59_900)).toBe("59.9s");
  });

  it("renders 1m–1h durations as `Xm YYs`", () => {
    expect(formatDuration(60_000)).toBe("1m 00s");
    expect(formatDuration(72_000)).toBe("1m 12s");
    expect(formatDuration(3_599_000)).toBe("59m 59s");
  });

  it("renders >=1h durations as `Xh YYm`", () => {
    expect(formatDuration(3_600_000)).toBe("1h 00m");
    expect(formatDuration(3_725_000)).toBe("1h 02m");
  });

  it("treats negative or non-finite values as 0ms", () => {
    expect(formatDuration(-1)).toBe("0ms");
    expect(formatDuration(Number.NaN)).toBe("0ms");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0ms");
  });
});

describe("startTimer", () => {
  it("returns a non-zero elapsed value after a delay", async () => {
    const t = startTimer();
    await new Promise((r) => setTimeout(r, 25));
    expect(t.ms()).toBeGreaterThanOrEqual(20);
  });

  it("format() renders the elapsed time", async () => {
    const t = startTimer();
    await new Promise((r) => setTimeout(r, 10));
    expect(t.format()).toMatch(/^\d+ms$/);
  });
});
