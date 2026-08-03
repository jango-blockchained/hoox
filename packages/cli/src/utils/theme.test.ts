/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { theme, icons, stripAnsi } from "./theme.js";

describe("theme tokens", () => {
  it("defines all text tokens", () => {
    expect(typeof theme.text).toBe("function");
    expect(typeof theme.textMuted).toBe("function");
    expect(typeof theme.textSubtle).toBe("function");
    expect(typeof theme.textFaint).toBe("function");
    expect(typeof theme.border).toBe("function");
    expect(typeof theme.borderStrong).toBe("function");
  });

  it("defines all status tokens", () => {
    expect(typeof theme.success).toBe("function");
    expect(typeof theme.error).toBe("function");
    expect(typeof theme.warning).toBe("function");
    expect(typeof theme.info).toBe("function");
    expect(typeof theme.accent).toBe("function");
  });

  it("produces ANSI codes that strip cleanly (length invariant)", () => {
    const samples = [
      theme.text("hello"),
      theme.textMuted("hello"),
      theme.textSubtle("hello"),
      theme.textFaint("hello"),
      theme.border("hello"),
      theme.success("hello"),
      theme.error("hello"),
      theme.warning("hello"),
      theme.info("hello"),
      theme.accent("hello"),
    ];
    for (const s of samples) {
      expect(stripAnsi(s)).toBe("hello");
    }
  });

  it("keeps the original semantic names working", () => {
    // Backward compatibility — existing code uses these names.
    expect(typeof theme.success).toBe("function");
    expect(typeof theme.error).toBe("function");
    expect(typeof theme.warning).toBe("function");
    expect(typeof theme.info).toBe("function");
    expect(typeof theme.accent).toBe("function");
    expect(typeof theme.dim).toBe("function");
    expect(typeof theme.bold).toBe("function");
    expect(typeof theme.heading).toBe("function");
    expect(typeof theme.value).toBe("function");
    expect(typeof theme.key).toBe("function");
  });
});

describe("icons", () => {
  it("defines all required icons", () => {
    expect(typeof icons.success).toBe("string");
    expect(typeof icons.error).toBe("string");
    expect(typeof icons.warning).toBe("string");
    expect(typeof icons.info).toBe("string");
    expect(typeof icons.arrow).toBe("string");
    expect(Array.isArray(icons.spinner)).toBe(true);
    expect(icons.spinner.length).toBeGreaterThan(4);
  });

  it("uses the refined glyphs", () => {
    expect(icons.success).toBe("✓");
    expect(icons.error).toBe("✗");
    expect(icons.warning).toBe("⚠");
    expect(icons.info).toBe("ℹ");
    expect(icons.arrow).toBe("→");
  });

  it("uses braille dots for the spinner", () => {
    for (const frame of icons.spinner) {
      expect(typeof frame).toBe("string");
      expect(frame.length).toBeGreaterThan(0);
    }
  });
});
