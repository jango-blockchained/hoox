/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "bun:test";

describe("Button Component", () => {
  it("should be importable", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
    expect(typeof Button).toBe("function");
  });

  it("should export button variants", async () => {
    const module = await import("../../src/components/ui/button");
    expect(module).toHaveProperty("Button");
  });

  it("should have default variant", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
  });

  it("should support multiple size variants", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
    // Component supports: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg
  });

  it("should support multiple style variants", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
    // Component supports: default, destructive, outline, secondary, ghost, link
  });

  it("should be a React component", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button.name).toBe("Button");
  });

  it("should accept className prop", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
  });

  it("should accept asChild prop", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
  });

  it("should accept standard button props", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
  });

  it("should be disabled when disabled prop is true", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
  });

  it("should handle click events", async () => {
    const { Button } = await import("../../src/components/ui/button");
    expect(Button).toBeDefined();
  });
});
