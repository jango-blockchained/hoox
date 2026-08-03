/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chrome component export tests — ViewHeader + Panel + CoolBrackets.
 */
import { describe, it, expect } from "bun:test";
import { ViewHeader } from "./view-header";
import { Panel } from "./panel";
import { CoolBrackets, CoolGlyph, useCoolHue } from "./cool-brackets";
import { Colors } from "@hoox-sh/hoox-shared";

describe("chrome", () => {
  it("exports ViewHeader and Panel", () => {
    expect(typeof ViewHeader).toBe("function");
    expect(typeof Panel).toBe("function");
  });

  it("exports cool bracket chrome (static accent, no animation)", () => {
    expect(typeof CoolBrackets).toBe("function");
    expect(typeof CoolGlyph).toBe("function");
    expect(typeof useCoolHue).toBe("function");
    const hue = useCoolHue(100, true);
    expect(hue.color).toBe(Colors.accent);
    expect(hue.index).toBe(0);
  });
});
