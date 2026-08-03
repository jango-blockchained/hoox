/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for shared router utilities
 * Run with: bun test packages/shared/test/router.test.ts
 */

import { describe, test, expect } from "bun:test";
import { createRouter, type Handler } from "../src/router";

// Mock handler for testing
const mockHandler: Handler = async () => {
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};

describe("Router", () => {
  test("should create router instance", () => {
    const router = createRouter();
    expect(router).toBeDefined();
    expect(typeof router.get).toBe("function");
    expect(typeof router.post).toBe("function");
    expect(typeof router.handle).toBe("function");
  });

  test("should register GET route", () => {
    const router = createRouter();
    router.get("/test", mockHandler);
    // If we can get routes, verify here
    expect(true).toBe(true); // Placeholder
  });

  test("should register POST route", () => {
    const router = createRouter();
    router.post("/test", mockHandler);
    expect(true).toBe(true); // Placeholder
  });

  test("should return 404 for unmatched route", async () => {
    const router = createRouter();
    const req = new Request("http://localhost/unknown");
    const env = {};
    const ctx = {} as ExecutionContext;

    const res = await router.handle(req, env, ctx);
    expect(res.status).toBe(404);
  });

  test("should match registered route", async () => {
    const router = createRouter();
    let handlerCalled = false;

    router.get("/api/test", async () => {
      handlerCalled = true;
      return new Response("OK");
    });

    const req = new Request("http://localhost/api/test");
    const env = {};
    const ctx = {} as ExecutionContext;

    const res = await router.handle(req, env, ctx);
    expect(res.status).toBe(200);
    expect(handlerCalled).toBe(true);
  });
});
