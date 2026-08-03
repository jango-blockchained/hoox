/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import {
  sanitizeWranglerOutput,
  formatSecretFailureDetails,
} from "./wrangler-output.js";

describe("sanitizeWranglerOutput", () => {
  it("strips banners and keeps the error line", () => {
    const raw = [
      "⛅️ wrangler 4.114.0",
      "────────────────────",
      "Getting User settings...",
      "✘ [ERROR] Processing wrangler.jsonc configuration:",
      '  - The field "secrets" should be an object but got ["INTERNAL_KEY_BINDING"].',
      "🪵  Logs were written to /tmp/wrangler.log",
    ].join("\n");

    const out = sanitizeWranglerOutput(raw);
    expect(out).toContain("secrets");
    expect(out).not.toContain("⛅️");
    expect(out).not.toContain("Logs were written");
  });

  it("handles empty input", () => {
    expect(sanitizeWranglerOutput("")).toMatch(/no output/i);
  });

  it("strips ANSI codes", () => {
    const raw = "\u001b[31m✘ ERROR\u001b[0m not authenticated";
    expect(sanitizeWranglerOutput(raw)).toContain("not authenticated");
  });
});

describe("formatSecretFailureDetails", () => {
  it("formats name: reason lines", () => {
    expect(
      formatSecretFailureDetails([
        { name: "A", reason: "missing" },
        { name: "B", reason: "placeholder" },
      ])
    ).toBe("A: missing\nB: placeholder");
  });
});
