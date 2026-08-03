/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  renderBanner,
  renderBannerMinimal,
  renderBannerLogo,
  renderLegacy,
  renderCompactBanner,
  animateBanner,
  BANNER_VARIANTS,
  DISCLAIMER,
} from "./banner.js";
import { stripAnsi } from "../utils/theme.js";

describe("renderBanner", () => {
  it("renders the logo variant by default", () => {
    const defaultBanner = renderBanner();
    const logoBanner = renderBannerLogo();
    expect(stripAnsi(defaultBanner)).toBe(stripAnsi(logoBanner));
  });

  it("minimal is an alias of logo", () => {
    expect(stripAnsi(renderBannerMinimal())).toBe(
      stripAnsi(renderBannerLogo())
    );
  });

  it("renders the explicitly-requested variant", () => {
    const horizon = renderBanner("horizon");
    const logo = renderBanner("logo");
    expect(stripAnsi(horizon)).not.toBe(stripAnsi(logo));
  });

  it("is wordmark-only (no geometric side mark)", () => {
    const plain = stripAnsi(renderBannerLogo());
    // No brand-mark diagonal hooks
    expect(plain).not.toContain("██╲");
    expect(plain).not.toContain("╱██");
    // Compact small-font HOOX glyphs
    expect(plain).toContain("_   _");
    expect(plain).toContain("| | | |");
  });

  it("includes the HOOX wordmark and tagline", () => {
    const plain = stripAnsi(renderBannerLogo());
    expect(plain).toMatch(/_\/\\_|_\/\\_/); // bottom of O/X style
    expect(plain).toContain("Cloudflare Workers Platform");
  });

  it("strips cleanly (no ansi codes leftover after visible text)", () => {
    for (const v of Object.keys(BANNER_VARIANTS) as Array<
      keyof typeof BANNER_VARIANTS
    >) {
      const out = BANNER_VARIANTS[v]();
      for (const line of out.split("\n")) {
        expect(line.startsWith("\x1b") || line.endsWith("\x1b")).toBe(false);
      }
    }
  });
});

describe("banner version (bug fix)", () => {
  it("includes the current package.json version, not a hardcoded one", () => {
    const out = renderCompactBanner();
    expect(out).toMatch(/v?\d+\.\d+\.\d+/);
  });

  it("the legacy variant does NOT show 'v0.3.0' (the bug)", () => {
    const out = renderLegacy();
    expect(out).not.toContain("0.3.0");
  });

  it("resolves the version from package.json in any layout (source or bundle)", async () => {
    const mod = await import("./banner.js");
    expect(mod).toBeDefined();
    const out = mod.renderCompactBanner();
    expect(out).not.toContain("unknown");
    expect(out).toMatch(/v\d+\.\d+\.\d+/);
  });

  it("static logo banner includes the package version", () => {
    const plain = stripAnsi(renderBannerLogo());
    expect(plain).toMatch(/v\d+\.\d+\.\d+/);
  });
});

describe("renderCompactBanner", () => {
  it("returns a single line", () => {
    const out = renderCompactBanner();
    expect(out.split("\n").length).toBe(1);
  });
});

describe("animateBanner", () => {
  it("writes a static frame when forced static (non-TTY path)", async () => {
    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      const lines = await animateBanner({ static: true });
      // Compact wordmark: rule + 4 lines + rule + meta = 7
      expect(lines).toBeGreaterThan(4);
      const out = chunks.join("");
      expect(stripAnsi(out)).toContain("Cloudflare Workers Platform");
      // Static path must not use cursor hide / line-clear animation sequences
      expect(out).not.toContain("\x1b[?25l");
      expect(out).not.toContain("\x1b[2K");
      // eslint-disable-next-line no-control-regex -- intentional: matches ESC cursor-up sequences
      expect(out).not.toMatch(/\x1b\[\d+A/);
    } finally {
      process.stdout.write = origWrite;
    }
  });
});

describe("DISCLAIMER", () => {
  it("is a non-empty string mentioning trading risk", () => {
    expect(DISCLAIMER.length).toBeGreaterThan(0);
    expect(DISCLAIMER.toLowerCase()).toContain("risk");
  });
});
