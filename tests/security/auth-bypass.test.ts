/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auth bypass security tests
 *
 * Verifies that all protected worker endpoints reject unauthenticated requests.
 * These tests validate the fail-closed behavior of requireInternalAuth and
 * the timing-safe API key comparison on the hoox gateway.
 */

import { describe, it, expect } from "bun:test";
import {
  requireInternalAuth,
  timingSafeEqual,
} from "@jango-blockchained/hoox-shared/middleware";

// ── requireInternalAuth (fail-closed) ────────────────────────────────────

describe("requireInternalAuth - fail-closed", () => {
  it("rejects with 401 when INTERNAL_KEY_BINDING is not configured", () => {
    const env = {} as Record<string, unknown>;
    const request = new Request("http://localhost/test");

    const result = requireInternalAuth(request, env);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("rejects with 401 when INTERNAL_KEY_BINDING is undefined", () => {
    const env = { INTERNAL_KEY_BINDING: undefined };
    const request = new Request("http://localhost/test");

    const result = requireInternalAuth(request, env);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("rejects with 401 when key is configured but header is missing", () => {
    const env = { INTERNAL_KEY_BINDING: "secret-123" };
    const request = new Request("http://localhost/test");

    const result = requireInternalAuth(request, env);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("rejects with 401 when key is configured but header has wrong value", () => {
    const env = { INTERNAL_KEY_BINDING: "secret-123" };
    const request = new Request("http://localhost/test", {
      headers: { "X-Internal-Auth-Key": "wrong-key" },
    });

    const result = requireInternalAuth(request, env);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("passes (returns null) when key is configured and header matches", () => {
    const env = { INTERNAL_KEY_BINDING: "secret-123" };
    const request = new Request("http://localhost/test", {
      headers: { "X-Internal-Auth-Key": "secret-123" },
    });

    const result = requireInternalAuth(request, env);

    expect(result).toBeNull();
  });
});

// ── timingSafeEqual ──────────────────────────────────────────────────────

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("hello", "hello")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeEqual("hello", "hxllo")).toBe(false);
  });

  it("returns false for different length strings", () => {
    expect(timingSafeEqual("hello", "world!")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("handles special characters", () => {
    expect(timingSafeEqual("api-key-123!@#", "api-key-123!@#")).toBe(true);
    expect(timingSafeEqual("api-key-123!@#", "api-key-456!@#")).toBe(false);
  });

  it("handles long API keys", () => {
    const longKey = "a".repeat(1000);
    const wrongKey = "a".repeat(999) + "b";
    expect(timingSafeEqual(longKey, longKey)).toBe(true);
    expect(timingSafeEqual(longKey, wrongKey)).toBe(false);
  });
});
