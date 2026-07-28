/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Colors Utility Tests — Design token validation.
 *
 * Tests that the Hoox design system colors are correctly defined,
 * follow the black / cool-indigo DNA (#050508 bg, #818CF8 accent),
 * and provide adequate contrast ratios for TUI readability.
 *
 * Source of truth: @jango-blockchained/hoox-shared (Colors + status maps).
 * Uses Bun test runner.
 */
import { describe, it, expect } from "bun:test";
import {
  Colors,
  CoolBracketPalette,
  ConnectionStatusColor,
  WorkerStatusColor,
  LogLevelColor,
  AlertSeverityColor,
} from "@jango-blockchained/hoox-shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a hex color string into RGB components */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(
    /^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/
  );
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

/** Calculate relative luminance (per WCAG 2.0) */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const toLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  );
}

/** Calculate contrast ratio between two hex colors */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Colors Design System", () => {
  // ── All tokens are valid hex colors ─────────────────────────────────────

  describe("valid hex colors", () => {
    it("all color tokens are valid 6-digit hex", () => {
      for (const [name, value] of Object.entries(Colors)) {
        expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it("all tokens can be parsed to RGB", () => {
      for (const [name, value] of Object.entries(Colors)) {
        const rgb = hexToRgb(value);
        expect(rgb).not.toBeNull();
        expect(rgb!.r).toBeGreaterThanOrEqual(0);
        expect(rgb!.r).toBeLessThanOrEqual(255);
        expect(rgb!.g).toBeGreaterThanOrEqual(0);
        expect(rgb!.g).toBeLessThanOrEqual(255);
        expect(rgb!.b).toBeGreaterThanOrEqual(0);
        expect(rgb!.b).toBeLessThanOrEqual(255);
      }
    });
  });

  // ── Black / cool DNA ────────────────────────────────────────────────────

  describe("black / cool DNA", () => {
    it("background is near-black (#050508)", () => {
      expect(Colors.background).toBe("#050508");
      const rgb = hexToRgb(Colors.background)!;
      expect(rgb.r).toBeLessThan(12);
      expect(rgb.g).toBeLessThan(12);
      expect(rgb.b).toBeLessThan(16);
    });

    it("accent is cool indigo (#818CF8)", () => {
      expect(Colors.accent).toBe("#818CF8");
      const rgb = hexToRgb(Colors.accent)!;
      // Indigo: blue-ish, not warm orange
      expect(rgb.b).toBeGreaterThan(rgb.r);
      expect(rgb.b).toBeGreaterThan(200);
    });

    it("highlight is cool cyan (distinct from accent)", () => {
      expect(Colors.highlight).toBe("#22D3EE");
      expect(Colors.highlight).not.toBe(Colors.accent);
      const rgb = hexToRgb(Colors.highlight)!;
      expect(rgb.b).toBeGreaterThan(200);
      expect(rgb.g).toBeGreaterThan(180);
    });

    it("cards are near-black elevated (#0A0A0F)", () => {
      expect(Colors.card).toBe("#0A0A0F");
      const bg = hexToRgb(Colors.background)!;
      const card = hexToRgb(Colors.card)!;
      // Slightly elevated vs background
      expect(card.r + card.g + card.b).toBeGreaterThan(bg.r + bg.g + bg.b);
    });

    it("borders are cool dark, not mid-grey", () => {
      const rgb = hexToRgb(Colors.border)!;
      expect(rgb.r).toBeLessThan(40);
      expect(rgb.g).toBeLessThan(40);
      expect(rgb.b).toBeLessThan(50);
    });
  });

  describe("CoolBracketPalette", () => {
    it("has multiple cool hues for animation", () => {
      expect(CoolBracketPalette.length).toBeGreaterThanOrEqual(6);
      for (const c of CoolBracketPalette) {
        expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it("starts in cyan/sky range (cool, not orange)", () => {
      const first = hexToRgb(CoolBracketPalette[0]!)!;
      expect(first.b).toBeGreaterThan(first.r);
    });
  });

  // ── Semantic Colors ─────────────────────────────────────────────────────

  describe("semantic colors", () => {
    it("success is cool emerald", () => {
      expect(Colors.success).toBe("#34D399");
      const rgb = hexToRgb(Colors.success)!;
      expect(rgb.g).toBeGreaterThan(180);
    });

    it("error is cool rose", () => {
      expect(Colors.error).toBe("#FB7185");
      const rgb = hexToRgb(Colors.error)!;
      expect(rgb.r).toBeGreaterThan(200);
    });

    it("warning is amber", () => {
      expect(Colors.warning).toBe("#FBBF24");
      const rgb = hexToRgb(Colors.warning)!;
      expect(rgb.r).toBeGreaterThan(200);
      expect(rgb.g).toBeGreaterThan(150);
    });

    it("info is sky blue", () => {
      expect(Colors.info).toBe("#38BDF8");
      const rgb = hexToRgb(Colors.info)!;
      expect(rgb.b).toBeGreaterThan(200);
    });
  });

  // ── Contrast Ratios ─────────────────────────────────────────────────────

  describe("contrast ratios", () => {
    it("foreground on background has sufficient contrast (WCAG AA)", () => {
      const ratio = contrastRatio(Colors.foreground, Colors.background);
      // WCAG AA requires 4.5:1 for normal text
      expect(ratio).toBeGreaterThan(4.5);
    });

    it("accent on background has sufficient contrast", () => {
      const ratio = contrastRatio(Colors.accent, Colors.background);
      // Large/bold text requires 3:1
      expect(ratio).toBeGreaterThan(3.0);
    });

    it("success on background has sufficient contrast", () => {
      const ratio = contrastRatio(Colors.success, Colors.background);
      expect(ratio).toBeGreaterThan(3.0);
    });

    it("error on background has sufficient contrast", () => {
      const ratio = contrastRatio(Colors.error, Colors.background);
      expect(ratio).toBeGreaterThan(3.0);
    });

    it("muted on background has at least some contrast (visible)", () => {
      const ratio = contrastRatio(Colors.muted, Colors.background);
      // Muted text should be readable but not dominant (>= 3.0)
      expect(ratio).toBeGreaterThan(3.0);
    });

    it("foreground on card has sufficient contrast", () => {
      const ratio = contrastRatio(Colors.foreground, Colors.card);
      expect(ratio).toBeGreaterThan(4.5);
    });

    it("accent on card has sufficient contrast", () => {
      const ratio = contrastRatio(Colors.accent, Colors.card);
      expect(ratio).toBeGreaterThan(3.0);
    });
  });

  // ── Token completeness ──────────────────────────────────────────────────

  describe("token completeness", () => {
    it("all required semantic tokens exist", () => {
      const required = [
        "background",
        "foreground",
        "card",
        "accent",
        "border",
        "muted",
        "muted-foreground",
        "dim",
        "success",
        "error",
        "warning",
        "info",
        "highlight",
        "backdrop",
      ] as const;
      for (const key of required) {
        expect(Colors[key]).toBeDefined();
      }
    });

    it("no two core semantic colors share the same hex value", () => {
      const semanticKeys = [
        "background",
        "foreground",
        "card",
        "accent",
        "border",
        "muted",
        "muted-foreground",
        "dim",
        "success",
        "error",
        "warning",
        "info",
        "backdrop",
      ] as const;
      const hexes = semanticKeys.map((k) => Colors[k]);
      // Core tokens must be unique (aliases like highlight/text may duplicate)
      const uniqueHexes = new Set(hexes);
      expect(uniqueHexes.size).toBe(semanticKeys.length);
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("hexToRgb returns null for invalid hex", () => {
      expect(hexToRgb("not-a-color")).toBeNull();
      expect(hexToRgb("#FFF")).toBeNull(); // 3-digit not supported
      expect(hexToRgb("#GGGGGG")).toBeNull();
      expect(hexToRgb("")).toBeNull();
    });

    it("contrast ratio of same color is 1.0", () => {
      expect(contrastRatio(Colors.background, Colors.background)).toBeCloseTo(
        1.0,
        1
      );
    });

    it("contrast ratio is symmetric", () => {
      const r1 = contrastRatio(Colors.foreground, Colors.background);
      const r2 = contrastRatio(Colors.background, Colors.foreground);
      expect(r1).toBeCloseTo(r2, 5);
    });

    it("white on black has maximum contrast (~21:1)", () => {
      const ratio = contrastRatio("#FFFFFF", "#000000");
      expect(ratio).toBeCloseTo(21, 0);
    });
  });
});

// ─── Status Color Mappings ───────────────────────────────────────────────────

describe("status color mappings", () => {
  it("connection status maps to correct colors", () => {
    expect(ConnectionStatusColor.connected).toBe(Colors.success);
    expect(ConnectionStatusColor.polling).toBe(Colors.highlight);
    expect(ConnectionStatusColor.reconnecting).toBe(Colors.warning);
    expect(ConnectionStatusColor.offline).toBe(Colors.error);
  });

  it("alert severity maps to correct colors", () => {
    expect(AlertSeverityColor.info).toBe(Colors.info);
    expect(AlertSeverityColor.warning).toBe(Colors.warning);
    expect(AlertSeverityColor.error).toBe(Colors.error);
    expect(AlertSeverityColor.critical).toBe(Colors.error);
  });

  it("worker status maps to correct colors", () => {
    expect(WorkerStatusColor.operational).toBe(Colors.success);
    expect(WorkerStatusColor.degraded).toBe(Colors.warning);
    expect(WorkerStatusColor.down).toBe(Colors.error);
  });

  it("log level maps to correct colors", () => {
    expect(LogLevelColor.debug).toBe(Colors.muted);
    expect(LogLevelColor.info).toBe(Colors.foreground);
    expect(LogLevelColor.warn).toBe(Colors.warning);
    expect(LogLevelColor.error).toBe(Colors.error);
  });
});
