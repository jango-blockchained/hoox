/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, mock } from "bun:test";
import { createRouter } from "../../src/router";
import type { ExecutionContext } from "@cloudflare/workers-types";

// Mock ExecutionContext
function createMockContext(): ExecutionContext {
  return {
    waitUntil: mock(() => {}),
    passThroughOnException: mock(() => {}),
  } as unknown as ExecutionContext;
}

describe("createRouter - Basic Routing", () => {
  it("routes GET request to registered handler", async () => {
    const router = createRouter();
    let called = false;

    router.get("/test", async () => {
      called = true;
      return new Response("OK");
    });

    const request = new Request("https://example.com/test");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(called).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });

  it("routes POST request to registered handler", async () => {
    const router = createRouter();
    let receivedBody = "";

    router.post("/submit", async (request) => {
      receivedBody = await request.text();
      return new Response("Created", { status: 201 });
    });

    const request = new Request("https://example.com/submit", {
      method: "POST",
      body: "test data",
    });
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(receivedBody).toBe("test data");
    expect(response.status).toBe(201);
  });

  it("routes PUT request to registered handler", async () => {
    const router = createRouter();
    let called = false;

    router.put("/update", async () => {
      called = true;
      return new Response("Updated");
    });

    const request = new Request("https://example.com/update", {
      method: "PUT",
    });
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(called).toBe(true);
  });

  it("routes DELETE request to registered handler", async () => {
    const router = createRouter();
    let called = false;

    router.delete("/remove", async () => {
      called = true;
      return new Response("Deleted");
    });

    const request = new Request("https://example.com/remove", {
      method: "DELETE",
    });
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(called).toBe(true);
  });
});

describe("createRouter - Path Parameters", () => {
  it("extracts single path parameter", async () => {
    const router = createRouter();
    let capturedId = "";

    router.get("/users/:userId", async (_req, _env, _ctx, params) => {
      capturedId = params?.userId || "";
      return new Response("OK");
    });

    const request = new Request("https://example.com/users/123");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedId).toBe("123");
  });

  it("extracts multiple path parameters", async () => {
    const router = createRouter();
    let capturedParams: Record<string, string> = {};

    router.get(
      "/users/:userId/posts/:postId",
      async (_req, _env, _ctx, params) => {
        capturedParams = params || {};
        return new Response("OK");
      }
    );

    const request = new Request("https://example.com/users/456/posts/789");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedParams).toEqual({ userId: "456", postId: "789" });
  });

  it("does not match partial paths", async () => {
    const router = createRouter();

    router.get("/users/:userId", async () => new Response("OK"));

    const request = new Request("https://example.com/users");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.status).toBe(404);
  });

  it("handles URL-encoded path parameters", async () => {
    const router = createRouter();
    let capturedName = "";

    router.get("/search/:query", async (_req, _env, _ctx, params) => {
      capturedName = params?.query || "";
      return new Response("OK");
    });

    const request = new Request("https://example.com/search/hello%20world");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedName).toBe("hello%20world");
  });

  it("matches path with multiple segments and parameters", async () => {
    const router = createRouter();
    let capturedParams: Record<string, string> = {};

    router.get(
      "/api/v1/users/:userId/comments/:commentId",
      async (_req, _env, _ctx, params) => {
        capturedParams = params || {};
        return new Response("OK");
      }
    );

    const request = new Request(
      "https://example.com/api/v1/users/user123/comments/comment456"
    );
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedParams).toEqual({
      userId: "user123",
      commentId: "comment456",
    });
  });
});

describe("createRouter - Error Handling", () => {
  it("returns 404 for unregistered path", async () => {
    const router = createRouter();

    router.get("/exists", async () => new Response("OK"));

    const request = new Request("https://example.com/not-found");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ success: false, error: "Not found" });
  });

  it("returns 405 for wrong method on existing path", async () => {
    const router = createRouter();

    router.get("/resource", async () => new Response("OK"));

    const request = new Request("https://example.com/resource", {
      method: "POST",
    });
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.status).toBe(405);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error as string).toContain("Method POST not allowed");
  });

  it("returns 405 for wrong method on parameterized path", async () => {
    const router = createRouter();

    router.get("/users/:userId", async () => new Response("OK"));

    const request = new Request("https://example.com/users/123", {
      method: "DELETE",
    });
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.status).toBe(405);
  });

  it("returns 404 when no routes registered", async () => {
    const router = createRouter();

    const request = new Request("https://example.com/anything");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.status).toBe(404);
  });
});

describe("createRouter - Middleware", () => {
  it("executes middleware before handler", async () => {
    const router = createRouter();
    const executionOrder: string[] = [];

    const middleware = async (
      _req: Request,
      _env: any,
      _ctx: ExecutionContext
    ) => {
      executionOrder.push("middleware");
      return null;
    };

    router.get(
      "/test",
      async () => {
        executionOrder.push("handler");
        return new Response("OK");
      },
      [middleware as any]
    );

    const request = new Request("https://example.com/test");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(executionOrder).toEqual(["middleware", "handler"]);
  });

  it("middleware can short-circuit with response", async () => {
    const router = createRouter();
    let handlerCalled = false;

    const middleware = async (
      _req: Request,
      _env: any,
      _ctx: ExecutionContext
    ) => {
      return new Response("Blocked", { status: 403 });
    };

    router.get(
      "/test",
      async () => {
        handlerCalled = true;
        return new Response("OK");
      },
      [middleware as any]
    );

    const request = new Request("https://example.com/test");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Blocked");
  });

  it("executes multiple middleware in order", async () => {
    const router = createRouter();
    const executionOrder: string[] = [];

    const middleware1 = async (
      _req: Request,
      _env: any,
      _ctx: ExecutionContext
    ) => {
      executionOrder.push("middleware1");
      return null;
    };

    const middleware2 = async (
      _req: Request,
      _env: any,
      _ctx: ExecutionContext
    ) => {
      executionOrder.push("middleware2");
      return null;
    };

    router.get(
      "/test",
      async () => {
        executionOrder.push("handler");
        return new Response("OK");
      },
      [middleware1 as any, middleware2 as any]
    );

    const request = new Request("https://example.com/test");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(executionOrder).toEqual(["middleware1", "middleware2", "handler"]);
  });

  it("middleware receives request, env, and context", async () => {
    const router = createRouter();
    let receivedEnv: any = null;

    const middleware = async (
      _req: Request,
      env: any,
      _ctx: ExecutionContext
    ) => {
      receivedEnv = env;
      return null;
    };

    router.get("/test", async () => new Response("OK"), [middleware as any]);

    const request = new Request("https://example.com/test");
    const env = { TEST_VAR: "test-value" };
    const ctx = createMockContext();
    await router.handle(request, env, ctx);

    expect(receivedEnv).toEqual(env);
  });

  it("middleware can access request properties", async () => {
    const router = createRouter();
    let capturedMethod = "";
    let capturedUrl = "";

    const middleware = async (
      req: Request,
      _env: any,
      _ctx: ExecutionContext
    ) => {
      capturedMethod = req.method;
      capturedUrl = req.url;
      return null;
    };

    router.post("/api/data", async () => new Response("OK"), [
      middleware as any,
    ]);

    const request = new Request("https://example.com/api/data", {
      method: "POST",
    });
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedMethod).toBe("POST");
    expect(capturedUrl).toContain("/api/data");
  });

  it("first middleware returning response prevents subsequent middleware", async () => {
    const router = createRouter();
    const executionOrder: string[] = [];

    const middleware1 = async (
      _req: Request,
      _env: any,
      _ctx: ExecutionContext
    ) => {
      executionOrder.push("middleware1");
      return new Response("Stopped", { status: 401 });
    };

    const middleware2 = async (
      _req: Request,
      _env: any,
      _ctx: ExecutionContext
    ) => {
      executionOrder.push("middleware2");
      return null;
    };

    router.get(
      "/test",
      async () => {
        executionOrder.push("handler");
        return new Response("OK");
      },
      [middleware1 as any, middleware2 as any]
    );

    const request = new Request("https://example.com/test");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(executionOrder).toEqual(["middleware1"]);
    expect(response.status).toBe(401);
  });
});

describe("createRouter - Edge Cases", () => {
  it("preserves query parameters", async () => {
    const router = createRouter();
    let capturedUrl = "";

    router.get("/search", async (req) => {
      capturedUrl = req.url;
      return new Response("OK");
    });

    const request = new Request("https://example.com/search?q=test&limit=10");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedUrl).toContain("q=test");
    expect(capturedUrl).toContain("limit=10");
  });

  it("handles handler exceptions gracefully", async () => {
    const router = createRouter();

    router.get("/error", async () => {
      throw new Error("Handler error");
    });

    const request = new Request("https://example.com/error");
    const ctx = createMockContext();

    // Should throw the error
    try {
      await router.handle(request, {}, ctx);
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toBe("Handler error");
    }
  });

  it("last handler wins when multiple registered on same path", async () => {
    const router = createRouter();
    let callCount = 0;

    router.get("/test", async () => {
      callCount++;
      return new Response("First");
    });

    router.get("/test", async () => {
      callCount++;
      return new Response("Second");
    });

    const request = new Request("https://example.com/test");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(callCount).toBe(1);
    expect(await response.text()).toBe("Second");
  });

  it("case-sensitive path matching", async () => {
    const router = createRouter();

    router.get("/Users", async () => new Response("OK"));

    const request = new Request("https://example.com/users");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.status).toBe(404);
  });

  it("handles paths with special characters in parameters", async () => {
    const router = createRouter();
    let capturedId = "";

    router.get("/items/:itemId", async (_req, _env, _ctx, params) => {
      capturedId = params?.itemId || "";
      return new Response("OK");
    });

    const request = new Request("https://example.com/items/item-123_abc");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedId).toBe("item-123_abc");
  });

  it("does not match path with extra segments", async () => {
    const router = createRouter();

    router.get("/api/users", async () => new Response("OK"));

    const request = new Request("https://example.com/api/users/123");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.status).toBe(404);
  });

  it("handles empty path correctly", async () => {
    const router = createRouter();

    router.get("/", async () => new Response("Home"));

    const request = new Request("https://example.com/");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Home");
  });

  it("handles multiple different methods on same path", async () => {
    const router = createRouter();

    router.get("/resource", async () => new Response("GET"));
    router.post("/resource", async () => new Response("POST"));
    router.put("/resource", async () => new Response("PUT"));

    const getReq = new Request("https://example.com/resource");
    const postReq = new Request("https://example.com/resource", {
      method: "POST",
    });
    const putReq = new Request("https://example.com/resource", {
      method: "PUT",
    });
    const ctx = createMockContext();

    const getRes = await router.handle(getReq, {}, ctx);
    const postRes = await router.handle(postReq, {}, ctx);
    const putRes = await router.handle(putReq, {}, ctx);

    expect(await getRes.text()).toBe("GET");
    expect(await postRes.text()).toBe("POST");
    expect(await putRes.text()).toBe("PUT");
  });

  it("passes params to handler even with middleware", async () => {
    const router = createRouter();
    let capturedParams: Record<string, string> = {};

    const middleware = async (
      _req: Request,
      _env: any,
      _ctx: ExecutionContext
    ) => {
      return null;
    };

    router.get(
      "/users/:userId",
      async (_req, _env, _ctx, params) => {
        capturedParams = params || {};
        return new Response("OK");
      },
      [middleware as any]
    );

    const request = new Request("https://example.com/users/999");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedParams).toEqual({ userId: "999" });
  });

  it("handles numeric path parameters", async () => {
    const router = createRouter();
    let capturedId = "";

    router.get("/posts/:postId", async (_req, _env, _ctx, params) => {
      capturedId = params?.postId || "";
      return new Response("OK");
    });

    const request = new Request("https://example.com/posts/12345");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedId).toBe("12345");
  });

  it("handles alphanumeric path parameters", async () => {
    const router = createRouter();
    let capturedId = "";

    router.get("/items/:itemId", async (_req, _env, _ctx, params) => {
      capturedId = params?.itemId || "";
      return new Response("OK");
    });

    const request = new Request("https://example.com/items/abc123def456");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(capturedId).toBe("abc123def456");
  });
});

describe("createRouter - Response Headers", () => {
  it("preserves response headers from handler", async () => {
    const router = createRouter();

    router.get("/test", async () => {
      return new Response("OK", {
        headers: { "X-Custom-Header": "custom-value" },
      });
    });

    const request = new Request("https://example.com/test");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
  });

  it("error responses have correct content-type", async () => {
    const router = createRouter();

    const request = new Request("https://example.com/not-found");
    const ctx = createMockContext();
    const response = await router.handle(request, {}, ctx);

    expect(response.headers.get("Content-Type")).toBe("application/json");
  });
});

describe("createRouter - Environment Variables", () => {
  it("passes environment to handler", async () => {
    const router = createRouter();
    let receivedEnv: any = null;

    router.get("/test", async (_req, env) => {
      receivedEnv = env;
      return new Response("OK");
    });

    const request = new Request("https://example.com/test");
    const env = { API_KEY: "secret123", DB_URL: "postgres://..." };
    const ctx = createMockContext();
    await router.handle(request, env, ctx);

    expect(receivedEnv).toEqual(env);
  });

  it("passes execution context to handler", async () => {
    const router = createRouter();
    let receivedCtx: any = null;

    router.get("/test", async (_req, _env, ctx) => {
      receivedCtx = ctx;
      return new Response("OK");
    });

    const request = new Request("https://example.com/test");
    const ctx = createMockContext();
    await router.handle(request, {}, ctx);

    expect(receivedCtx).toBe(ctx);
  });
});
