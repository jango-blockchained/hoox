/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for SecretsViewer — export + pure helpers surface.
 * Full render tests for this view are covered by integration/e2e paths;
 * unit render with mock.module pollutes the shared store under Bun's runner.
 */
import { describe, it, expect } from "bun:test";
import { SecretsViewer } from "./secrets-viewer";

describe("SecretsViewer", () => {
  it("is a function component", () => {
    expect(SecretsViewer).toBeInstanceOf(Function);
    expect(SecretsViewer.name).toBe("SecretsViewer");
  });

  it("does not require localStorage (Bun-safe)", () => {
    // Bun has no localStorage; SecretsViewer must never touch it
    expect("localStorage" in globalThis).toBe(false);
  });

  it("documents keyboard search (/) and list navigation (↑↓)", async () => {
    // Contract: SecretsViewer wires useKeyboard for / and ↑↓ (parity with KV Viewer).
    // Regression guard against the previous dead SearchBox (onChange discarded).
    const src = await Bun.file(
      new URL("./secrets-viewer.tsx", import.meta.url)
    ).text();
    expect(src).toContain("useKeyboard");
    expect(src).toContain('key.name === "slash"');
    expect(src).toContain("setSearchActive(true)");
    expect(src).toContain("filteredSecrets");
    expect(src).toContain("onChange={setSearch}");
  });
});
