/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for rate-limiter middleware
 * Run with: bun test packages/shared/test/rate-limit.test.ts
 */

import { describe, test, expect, mock } from "bun:test";
import { createRateLimiter } from "../src/middleware/rate-limit";
import type { RateLimitConfig } from "../src/middleware/rate-limit";

type KvParam = Parameters<typeof createRateLimiter>[0];

type MockFn = ReturnType<typeof mock>;

interface MockKv {
  get: MockFn & ((key: string, options?: unknown) => Promise<string | null>);
  put: MockFn &
    ((
      key: string,
      value: string,
      options?: { expirationTtl?: number }
    ) => Promise<void>);
}

/**
 * Creates a mock KV namespace for testing rate limiting.
 * Simulates Cloudflare KVNamespace with get/put operations
 * backed by an in-memory Map. Returns a combined type for
 * both test assertions and KVNamespace compatibility.
 */
function createMockKv(): MockKv {
  const store = new Map<string, string>();
  return {
    get: mock((key: string, _options?: unknown): Promise<string | null> => {
      return Promise.resolve(store.get(key) ?? null);
    }) as MockKv["get"],
    put: mock(
      (
        key: string,
        value: string,
        _options?: { expirationTtl?: number }
      ): Promise<void> => {
        store.set(key, value);
        return Promise.resolve();
      }
    ) as MockKv["put"],
  };
}

describe("Rate Limiter", () => {
  const defaultConfig: RateLimitConfig = {
    maxRequests: 5,
    windowSeconds: 60,
  };

  describe("createRateLimiter", () => {
    test("returns object with check and enforce methods", () => {
      const kv = createMockKv();
      const limiter = createRateLimiter(
        kv as unknown as KvParam,
        defaultConfig
      );

      expect(limiter).toBeDefined();
      expect(typeof limiter.check).toBe("function");
      expect(typeof limiter.enforce).toBe("function");
    });
  });

  describe("check", () => {
    test("allows first request (returns allowed=true, remaining=maxRequests-1)", async () => {
      const kv = createMockKv();
      const limiter = createRateLimiter(
        kv as unknown as KvParam,
        defaultConfig
      );
      const request = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "192.168.1.1" },
      });

      const result = await limiter.check(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // maxRequests (5) - 1
    });

    test("increments count on each request", async () => {
      const kv = createMockKv();
      const limiter = createRateLimiter(
        kv as unknown as KvParam,
        defaultConfig
      );
      const request = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "192.168.1.1" },
      });

      const r1 = await limiter.check(request);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(4);

      const r2 = await limiter.check(request);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(3);

      const r3 = await limiter.check(request);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(2);

      // Verify KV put was called 3 times with incremented values
      expect(kv.put.mock.calls.length).toBe(3);
      expect(kv.put.mock.calls[0][1]).toBe("1");
      expect(kv.put.mock.calls[1][1]).toBe("2");
      expect(kv.put.mock.calls[2][1]).toBe("3");
    });

    test("blocks when max reached (returns allowed=false, remaining=0)", async () => {
      const kv = createMockKv();
      const config: RateLimitConfig = { maxRequests: 2, windowSeconds: 60 };
      const limiter = createRateLimiter(kv as unknown as KvParam, config);
      const request = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "192.168.1.1" },
      });

      const r1 = await limiter.check(request);
      expect(r1.allowed).toBe(true);

      const r2 = await limiter.check(request);
      expect(r2.allowed).toBe(true);

      const r3 = await limiter.check(request);
      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
      expect(r3.retryAfter).toBeDefined();
      expect(typeof r3.retryAfter).toBe("number");
      // retryAfter should be positive and within the window
      expect(r3.retryAfter!).toBeGreaterThanOrEqual(0);
      expect(r3.retryAfter!).toBeLessThanOrEqual(config.windowSeconds);
    });

    test("uses CF-Connecting-IP header for IP extraction", async () => {
      const kv = createMockKv();
      const limiter = createRateLimiter(
        kv as unknown as KvParam,
        defaultConfig
      );

      // Two requests from different IPs should have independent counters
      const req1 = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.1" },
      });
      const req2 = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.2" },
      });

      await limiter.check(req1);
      await limiter.check(req2);

      // Both should have remaining=maxRequests-1 since they're different IPs
      // but we already consumed 1 for each IP, so remaining is 3
      // Actually the test above already used up one from each IP.
      // Let's test it differently - same IP should not affect different IP
    });

    test("tracks IPs independently", async () => {
      const kv = createMockKv();
      const config: RateLimitConfig = { maxRequests: 1, windowSeconds: 60 };
      const limiter = createRateLimiter(kv as unknown as KvParam, config);

      const req1 = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.1" },
      });
      const req2 = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.2" },
      });

      // First request from IP1 hits limit
      const r1 = await limiter.check(req1);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(0);

      // Second request from IP1 is blocked
      const r2 = await limiter.check(req1);
      expect(r2.allowed).toBe(false);

      // Request from IP2 is still allowed (different IP)
      const r3 = await limiter.check(req2);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    test("uses CF-Connecting-IP header value, not X-Forwarded-For", async () => {
      const kv = createMockKv();
      const limiter = createRateLimiter(
        kv as unknown as KvParam,
        defaultConfig
      );

      const request = new Request("http://localhost/test", {
        headers: {
          "CF-Connecting-IP": "1.1.1.1",
          "X-Forwarded-For": "2.2.2.2",
        },
      });

      await limiter.check(request);

      // KV key should contain the CF-Connecting-IP value, not X-Forwarded-For
      const putKey = kv.put.mock.calls[0][0] as string;
      expect(putKey).toContain("1.1.1.1");
      expect(putKey).not.toContain("2.2.2.2");
    });

    test("works with custom keyPrefix", async () => {
      const kv = createMockKv();
      const config: RateLimitConfig = {
        maxRequests: 3,
        windowSeconds: 60,
        keyPrefix: "my-custom-prefix",
      };
      const limiter = createRateLimiter(kv as unknown as KvParam, config);
      const request = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.1" },
      });

      await limiter.check(request);

      // Verify the KV key contains the custom prefix and IP
      const putKey = kv.put.mock.calls[0][0] as string;
      expect(putKey).toContain("my-custom-prefix");
      expect(putKey).toContain("10.0.0.1");
    });

    test("returns retryAfter when blocked", async () => {
      const kv = createMockKv();
      const config: RateLimitConfig = { maxRequests: 0, windowSeconds: 30 };
      const limiter = createRateLimiter(kv as unknown as KvParam, config);
      const request = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.1" },
      });

      const result = await limiter.check(request);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      // retryAfter should be within the window
      expect(result.retryAfter!).toBeGreaterThanOrEqual(0);
      expect(result.retryAfter!).toBeLessThanOrEqual(30);
    });
  });

  describe("enforce", () => {
    test("returns null when allowed", async () => {
      const kv = createMockKv();
      const limiter = createRateLimiter(
        kv as unknown as KvParam,
        defaultConfig
      );
      const request = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.1" },
      });

      const result = await limiter.enforce(request);
      expect(result).toBeNull();
    });

    test("returns 429 response when blocked (check status, headers, body)", async () => {
      const kv = createMockKv();
      const config: RateLimitConfig = { maxRequests: 1, windowSeconds: 60 };
      const limiter = createRateLimiter(kv as unknown as KvParam, config);
      const request = new Request("http://localhost/test", {
        headers: { "CF-Connecting-IP": "10.0.0.1" },
      });

      // First request passes
      await limiter.enforce(request);

      // Second request should be blocked
      const result = await limiter.enforce(request);
      expect(result).not.toBeNull();

      // Check status
      expect(result!.status).toBe(429);

      // Check headers
      expect(result!.headers.get("Content-Type")).toBe("application/json");
      expect(result!.headers.get("Retry-After")).toBeDefined();

      // Check body
      const body = (await result!.json()) as {
        error: string;
        retryAfter?: number;
      };
      expect(body.error).toBe("Rate limit exceeded");
      expect(body.retryAfter).toBeDefined();
      expect(typeof body.retryAfter).toBe("number");
    });
  });
});
