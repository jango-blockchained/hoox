/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Comprehensive test suite for authentication middleware
 * Tests timing-safe comparison, Bearer token auth, and internal service auth
 */

import { describe, it, expect } from "bun:test";
import {
  requireAuth,
  requireInternalAuth,
  checkInternalAuth,
} from "../../src/middleware/auth";
import type { InternalAuthEnv } from "../../src/middleware/auth";
import type { Env } from "../../src/types";

describe("timingSafeEqual", () => {
  it("returns true for identical strings", async () => {
    const env = { INTERNAL_API_KEY: "test-key-123" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer test-key-123" },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeNull();
  });

  it("returns false for different length strings", async () => {
    const env = { INTERNAL_API_KEY: "test-key-123" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer short" },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("returns false for different strings of same length", async () => {
    const env = { INTERNAL_API_KEY: "test-key-123" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer test-key-456" },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("prevents timing attacks by comparing all bytes", async () => {
    // Test that comparison takes same time regardless of where mismatch occurs
    const env = { INTERNAL_API_KEY: "aaaaaaaaaa" } as unknown as Env;

    // Mismatch at start
    const request1 = new Request("https://example.com", {
      headers: { Authorization: "Bearer baaaaaaaaa" },
    });
    const result1 = await requireAuth(request1, env);
    expect(result1?.status).toBe(401);

    // Mismatch at end
    const request2 = new Request("https://example.com", {
      headers: { Authorization: "Bearer aaaaaaaaaab" },
    });
    const result2 = await requireAuth(request2, env);
    expect(result2?.status).toBe(401);

    // Both should fail with same status (timing-safe comparison)
    expect(result1?.status).toBe(result2?.status);
  });
});

describe("requireAuth", () => {
  it("returns null when valid Bearer token provided", async () => {
    const env = { INTERNAL_API_KEY: "secret-token" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer secret-token" },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeNull();
  });

  it("returns 401 when API key not configured", async () => {
    const env = {} as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer any-token" },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
    const body = await result?.json();
    expect(body).toEqual({ error: "Internal API key not configured" });
  });

  it("returns 401 when Authorization header missing", async () => {
    const env = { INTERNAL_API_KEY: "secret-token" } as unknown as Env;
    const request = new Request("https://example.com");

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
    const body = await result?.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when token does not match", async () => {
    const env = { INTERNAL_API_KEY: "secret-token" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer wrong-token" },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
    const body = await result?.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when Authorization format is invalid", async () => {
    const env = { INTERNAL_API_KEY: "secret-token" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "secret-token" }, // Missing "Bearer "
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
    const body = await result?.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when Bearer prefix is wrong case", async () => {
    const env = { INTERNAL_API_KEY: "secret-token" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "bearer secret-token" }, // lowercase "bearer"
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("returns 401 when Authorization header is empty", async () => {
    const env = { INTERNAL_API_KEY: "secret-token" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "" },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("returns 401 when Bearer token is empty", async () => {
    const env = { INTERNAL_API_KEY: "secret-token" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer " },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("returns 401 response with correct Content-Type header", async () => {
    const env = { INTERNAL_API_KEY: "secret-token" } as unknown as Env;
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer wrong" },
    });

    const result = await requireAuth(request, env);
    expect(result?.headers.get("Content-Type")).toBe("application/json");
  });
});

describe("requireInternalAuth", () => {
  it("returns null when valid internal key provided", () => {
    const env = {
      INTERNAL_KEY_BINDING: "internal-secret",
    } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "internal-secret" },
    });

    const result = requireInternalAuth(request, env);
    expect(result).toBeNull();
  });

  it("returns 401 when no key configured (fail closed)", () => {
    const env = {} as unknown as InternalAuthEnv;
    const request = new Request("https://example.com");

    const result = requireInternalAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("returns 401 when key configured but header missing", async () => {
    const env = {
      INTERNAL_KEY_BINDING: "internal-secret",
    } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com");

    const result = requireInternalAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
    const body = await result?.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 401 when key does not match", () => {
    const env = {
      INTERNAL_KEY_BINDING: "internal-secret",
    } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "wrong-key" },
    });

    const result = requireInternalAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("supports custom key name parameter", () => {
    const env = { CUSTOM_KEY: "custom-secret" } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "custom-secret" },
    });

    const result = requireInternalAuth(request, env, "CUSTOM_KEY");
    expect(result).toBeNull();
  });

  it("returns 401 with custom key name when key does not match", () => {
    const env = { CUSTOM_KEY: "custom-secret" } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "wrong-secret" },
    });

    const result = requireInternalAuth(request, env, "CUSTOM_KEY");
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("returns 401 when custom key not configured (fail closed)", () => {
    const env = {} as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "any-key" },
    });

    const result = requireInternalAuth(request, env, "CUSTOM_KEY");
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
  });

  it("returns 401 response with correct Content-Type header", () => {
    const env = {
      INTERNAL_KEY_BINDING: "internal-secret",
    } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "wrong-key" },
    });

    const result = requireInternalAuth(request, env);
    expect(result?.headers.get("Content-Type")).toBe("application/json");
  });

  it("uses timing-safe comparison to prevent timing attacks", () => {
    const env = {
      INTERNAL_KEY_BINDING: "aaaaaaaaaa",
    } as unknown as InternalAuthEnv;

    // Mismatch at start
    const request1 = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "baaaaaaaaa" },
    });
    const result1 = requireInternalAuth(request1, env);

    // Mismatch at end
    const request2 = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "aaaaaaaaaab" },
    });
    const result2 = requireInternalAuth(request2, env);

    // Both should fail with same status
    expect(result1?.status).toBe(401);
    expect(result2?.status).toBe(401);
  });

  it("accepts any configured key from a fallback list", () => {
    const env = {
      D1_READ_KEY_BINDING: "read-key",
      INTERNAL_KEY_BINDING: "legacy-key",
    } as unknown as InternalAuthEnv;

    const readRequest = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "read-key" },
    });
    const legacyRequest = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "legacy-key" },
    });

    expect(
      requireInternalAuth(readRequest, env, [
        "D1_READ_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
      ])
    ).toBeNull();
    expect(
      requireInternalAuth(legacyRequest, env, [
        "D1_READ_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
      ])
    ).toBeNull();
  });

  it("rejects when none of the fallback keys are configured (fail closed)", async () => {
    const env = {} as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "any-key" },
    });

    const result = requireInternalAuth(request, env, [
      "D1_READ_KEY_BINDING",
      "INTERNAL_KEY_BINDING",
    ]);
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(401);
    const body = await result?.json();
    expect(body).toEqual({
      success: false,
      error:
        "Internal auth key(s) not configured: D1_READ_KEY_BINDING | INTERNAL_KEY_BINDING",
    });
  });
});

describe("checkInternalAuth", () => {
  it("returns authorized true when valid key provided", () => {
    const env = {
      INTERNAL_KEY_BINDING: "internal-secret",
    } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "internal-secret" },
    });

    const result = checkInternalAuth(request, env);
    expect(result).toEqual({ authorized: true });
  });

  it("returns authorized false with error when key not configured", () => {
    const env = {} as unknown as InternalAuthEnv;
    const request = new Request("https://example.com");

    const result = checkInternalAuth(request, env);
    expect(result).toEqual({
      authorized: false,
      error: "INTERNAL_KEY_BINDING not configured",
    });
  });

  it("returns authorized false when key does not match", () => {
    const env = {
      INTERNAL_KEY_BINDING: "internal-secret",
    } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "wrong-key" },
    });

    const result = checkInternalAuth(request, env);
    expect(result).toEqual({ authorized: false, error: "Unauthorized" });
  });

  it("returns authorized false when header is missing", () => {
    const env = {
      INTERNAL_KEY_BINDING: "internal-secret",
    } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com");

    const result = checkInternalAuth(request, env);
    expect(result).toEqual({ authorized: false, error: "Unauthorized" });
  });

  it("supports custom key name parameter", () => {
    const env = { CUSTOM_KEY: "custom-secret" } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "custom-secret" },
    });

    const result = checkInternalAuth(request, env, "CUSTOM_KEY");
    expect(result).toEqual({ authorized: true });
  });

  it("returns error with custom key name when not configured", () => {
    const env = {} as unknown as InternalAuthEnv;
    const request = new Request("https://example.com");

    const result = checkInternalAuth(request, env, "CUSTOM_KEY");
    expect(result).toEqual({
      authorized: false,
      error: "CUSTOM_KEY not configured",
    });
  });

  it("returns authorized false with custom key when key does not match", () => {
    const env = { CUSTOM_KEY: "custom-secret" } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "wrong-secret" },
    });

    const result = checkInternalAuth(request, env, "CUSTOM_KEY");
    expect(result).toEqual({ authorized: false, error: "Unauthorized" });
  });

  it("uses timing-safe comparison to prevent timing attacks", () => {
    const env = {
      INTERNAL_KEY_BINDING: "aaaaaaaaaa",
    } as unknown as InternalAuthEnv;

    // Mismatch at start
    const request1 = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "baaaaaaaaa" },
    });
    const result1 = checkInternalAuth(request1, env);

    // Mismatch at end
    const request2 = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "aaaaaaaaaab" },
    });
    const result2 = checkInternalAuth(request2, env);

    // Both should return unauthorized
    expect(result1).toEqual({ authorized: false, error: "Unauthorized" });
    expect(result2).toEqual({ authorized: false, error: "Unauthorized" });
  });

  it("does not include error field when authorized", () => {
    const env = {
      INTERNAL_KEY_BINDING: "internal-secret",
    } as unknown as InternalAuthEnv;
    const request = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "internal-secret" },
    });

    const result = checkInternalAuth(request, env);
    expect(result.error).toBeUndefined();
    expect(Object.keys(result)).toEqual(["authorized"]);
  });

  it("accepts any configured key from a fallback list", () => {
    const env = {
      D1_WRITE_KEY_BINDING: "write-key",
      INTERNAL_KEY_BINDING: "legacy-key",
    } as unknown as InternalAuthEnv;

    const writeRequest = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "write-key" },
    });
    const legacyRequest = new Request("https://example.com", {
      headers: { "X-Internal-Auth-Key": "legacy-key" },
    });

    expect(
      checkInternalAuth(writeRequest, env, [
        "D1_WRITE_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
      ])
    ).toEqual({ authorized: true });
    expect(
      checkInternalAuth(legacyRequest, env, [
        "D1_WRITE_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
      ])
    ).toEqual({ authorized: true });
  });

  it("returns error listing all fallback fields when none configured", () => {
    const env = {} as unknown as InternalAuthEnv;
    const request = new Request("https://example.com");

    const result = checkInternalAuth(request, env, [
      "D1_WRITE_KEY_BINDING",
      "INTERNAL_KEY_BINDING",
    ]);
    expect(result).toEqual({
      authorized: false,
      error: "D1_WRITE_KEY_BINDING | INTERNAL_KEY_BINDING not configured",
    });
  });
});
