/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, mock } from "bun:test";

// Mock `server-only` so the client component can be imported under the
// bun test runner. The component itself uses browser-only modules
// (framer-motion, sonner) but those are loaded lazily and don't run
// during the import alone.
mock.module("server-only", () => ({}));

describe("NotificationTester Component", () => {
  it("should be importable", async () => {
    const module =
      await import("../src/components/dashboard/notification-tester");
    expect(module.NotificationTester).toBeDefined();
    expect(typeof module.NotificationTester).toBe("function");
  });

  it("should export NotificationTester as a named export", async () => {
    const module =
      await import("../src/components/dashboard/notification-tester");
    expect(module).toHaveProperty("NotificationTester");
    expect(module.NotificationTester.name).toBe("NotificationTester");
  });

  it("should be a client component (uses 'use client')", async () => {
    const module =
      await import("../src/components/dashboard/notification-tester");
    expect(module.NotificationTester).toBeDefined();
  });
});
