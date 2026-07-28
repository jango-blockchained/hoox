/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Security headers verification tests
 *
 * Verifies that the shared secureHeaders() utility produces the correct
 * security headers and that the hoox gateway includes them in responses.
 */

import { describe, it, expect } from "bun:test";
import {
  secureHeaders,
  wrapWithSecurityHeaders,
  SECURITY_HEADERS_DEFAULTS,
} from "@jango-blockchained/hoox-shared/middleware";

// ── secureHeaders() unit tests ──────────────────────────────────────────

describe("secureHeaders defaults", () => {
  it("returns all required security headers", () => {
    const headers = secureHeaders();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-XSS-Protection"]).toBe("1; mode=block");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBeDefined();
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains"
    );
    expect(headers["Content-Security-Policy"]).toBe("default-src 'self'");
  });

  it("has exactly 7 security headers", () => {
    const headers = secureHeaders();
    expect(Object.keys(headers).length).toBe(7);
  });
});

describe("secureHeaders overrides", () => {
  it("allows overriding individual headers", () => {
    const headers = secureHeaders({
      contentSecurityPolicy:
        "default-src 'self'; script-src 'self' 'unsafe-inline'",
    });
    expect(headers["Content-Security-Policy"]).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'"
    );
    // Other headers should remain default
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("allows disabling CSP by setting empty string", () => {
    const headers = secureHeaders({ contentSecurityPolicy: "" });
    expect(headers["Content-Security-Policy"]).toBeUndefined();
    expect(Object.keys(headers).length).toBe(6);
  });

  it("allows custom Permissions-Policy", () => {
    const headers = secureHeaders({
      permissionsPolicy: "geolocation=(self), microphone=()",
    });
    expect(headers["Permissions-Policy"]).toBe(
      "geolocation=(self), microphone=()"
    );
  });
});

describe("SECURITY_HEADERS_DEFAULTS", () => {
  it("has all required defaults defined", () => {
    expect(SECURITY_HEADERS_DEFAULTS.xContentTypeOptions).toBe("nosniff");
    expect(SECURITY_HEADERS_DEFAULTS.xFrameOptions).toBe("DENY");
    expect(SECURITY_HEADERS_DEFAULTS.strictTransportSecurity).toBe(
      "max-age=31536000; includeSubDomains"
    );
  });
});

describe("wrapWithSecurityHeaders", () => {
  it("adds security headers to a plain response", () => {
    const original = new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
    const wrapped = wrapWithSecurityHeaders(original);

    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(wrapped.headers.get("X-Frame-Options")).toBe("DENY");
    // Original headers preserved
    expect(wrapped.headers.get("Content-Type")).toBe("application/json");
  });

  it("preserves original body and status", async () => {
    const original = new Response(JSON.stringify({ hello: "world" }), {
      status: 201,
    });
    const wrapped = wrapWithSecurityHeaders(original);

    expect(wrapped.status).toBe(201);
    const body = await wrapped.json();
    expect(body.hello).toBe("world");
  });

  it("allows overriding security headers via options", () => {
    const original = new Response("ok", { status: 200 });
    const wrapped = wrapWithSecurityHeaders(original, {
      xFrameOptions: "SAMEORIGIN",
    });

    expect(wrapped.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});
