/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test, mock } from "bun:test";

mock.module("server-only", () => {
  return {};
});

describe("Dashboard Worker - Module Imports", () => {
  test("middleware module loads and exports middleware", async () => {
    const mod = await import("../src/middleware");
    expect(mod).toBeDefined();
    expect(mod).toHaveProperty("middleware");
  });

  test("login route defines POST handler", async () => {
    const mod = await import("../src/app/api/auth/login/route");
    expect(mod).toBeDefined();
    expect(mod).toHaveProperty("POST");
  });

  test("login route POST handler is a function", async () => {
    process.env.DASHBOARD_USER = "admin";
    process.env.DASHBOARD_PASS = "test";

    const { POST } = await import("../src/app/api/auth/login/route");
    expect(POST).toBeDefined();
    expect(typeof POST).toBe("function");
    expect(POST.name).toBe("POST");
  });

  test("settings route defines GET and POST handlers", async () => {
    const mod = await import("../src/app/api/settings/route");
    expect(mod).toBeDefined();
    expect(mod).toHaveProperty("GET");
    expect(mod).toHaveProperty("POST");
  });

  test("settings route GET handler is async function", async () => {
    const { GET } = await import("../src/app/api/settings/route");
    expect(GET).toBeDefined();
    expect(typeof GET).toBe("function");
    expect(GET.name).toBe("GET");
  });

  test("settings route POST handler is a function", async () => {
    const { POST } = await import("../src/app/api/settings/route");
    expect(POST).toBeDefined();
    expect(typeof POST).toBe("function");
  });
});
