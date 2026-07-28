/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";
import { copyToClipboard, copyViaSystemClipboard } from "./clipboard";
import { messageCopiedToClipboard } from "../components/ui/toast";

describe("clipboard", () => {
  it("treats empty text as success without throwing", async () => {
    const result = await copyToClipboard("   ", null);
    expect(result.ok).toBe(true);
  });

  it("copyViaSystemClipboard returns a tool name or null", async () => {
    const tool = await copyViaSystemClipboard("hoox-clipboard-test");
    // CI may lack clipboard tools; null is acceptable
    expect(tool === null || typeof tool === "string").toBe(true);
  });

  it("copyToClipboard falls back when no renderer is available", async () => {
    const result = await copyToClipboard("hello from hoox tui", null);
    // Success if system tool exists; otherwise structured failure
    if (result.ok) {
      expect(result.method === "osc52" || result.method === "system").toBe(
        true
      );
    } else {
      expect(result.error).toMatch(/clipboard/i);
    }
  });

  it("accepts notify option without throwing", async () => {
    // Toast singleton may no-op without a Toaster in unit tests
    const result = await copyToClipboard("notify me", null, { notify: true });
    expect(typeof result.ok).toBe("boolean");
  });
});

describe("messageCopiedToClipboard", () => {
  it("previews short text", () => {
    expect(messageCopiedToClipboard("hello")).toBe("Copied: “hello”");
  });

  it("truncates long text", () => {
    const long = "x".repeat(80);
    const msg = messageCopiedToClipboard(long);
    expect(msg.startsWith("Copied: “")).toBe(true);
    expect(msg.endsWith("…”")).toBe(true);
    expect(msg.length).toBeLessThan(long.length + 20);
  });

  it("collapses whitespace", () => {
    expect(messageCopiedToClipboard("a\n\nb")).toBe("Copied: “a b”");
  });
});
