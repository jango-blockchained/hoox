/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Comprehensive test suite for CORS middleware
 * Fail-closed defaults: no open origin (*)
 */

import { describe, it, expect } from "bun:test";
import {
  corsHeaders,
  publicCorsHeaders,
  internalCorsHeaders,
  resolveCorsOptions,
  handleCorsPreflightRequest,
} from "../../src/middleware/cors";

describe("corsHeaders", () => {
  it("does not set Allow-Origin by default (fail-closed)", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Methods"]).toBe(
      "GET, POST, OPTIONS, PUT, DELETE"
    );
    expect(headers["Access-Control-Allow-Headers"]).toBe(
      "Content-Type, Authorization, X-Request-ID"
    );
    expect(headers["Access-Control-Max-Age"]).toBe("86400");
  });

  it("does not advertise X-Internal-Auth-Key in allowHeaders by default", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Headers"]).not.toContain(
      "X-Internal-Auth-Key"
    );
  });

  it("does not include credentials header by default", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("allows custom origin", () => {
    const headers = corsHeaders({ allowOrigin: "https://example.com" });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });

  it("allows custom methods", () => {
    const headers = corsHeaders({ allowMethods: "GET, POST" });
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST");
  });

  it("allows custom headers", () => {
    const headers = corsHeaders({
      allowHeaders: "Content-Type, X-Custom-Header",
    });
    expect(headers["Access-Control-Allow-Headers"]).toBe(
      "Content-Type, X-Custom-Header"
    );
  });

  it("includes credentials header when enabled", () => {
    const headers = corsHeaders({ allowCredentials: true });
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("allows custom max age", () => {
    const headers = corsHeaders({ maxAge: 3600 });
    expect(headers["Access-Control-Max-Age"]).toBe("3600");
  });

  it("merges custom options with defaults", () => {
    const headers = corsHeaders({
      allowOrigin: "https://custom.com",
      maxAge: 1800,
    });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://custom.com");
    expect(headers["Access-Control-Allow-Methods"]).toBe(
      "GET, POST, OPTIONS, PUT, DELETE"
    );
    expect(headers["Access-Control-Max-Age"]).toBe("1800");
  });
});

describe("publicCorsHeaders", () => {
  it("sets * by default for public APIs", () => {
    const headers = publicCorsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("accepts a concrete origin", () => {
    const headers = publicCorsHeaders("https://app.example.com");
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://app.example.com"
    );
  });
});

describe("internalCorsHeaders", () => {
  it("returns empty object (no browser CORS surface)", () => {
    expect(internalCorsHeaders()).toEqual({});
  });
});

describe("handleCorsPreflightRequest", () => {
  it("returns null for non-OPTIONS requests", () => {
    const request = new Request("https://example.com/api/test", {
      method: "GET",
    });
    expect(handleCorsPreflightRequest(request)).toBeNull();
  });

  it("returns 204 for OPTIONS without open origin by default", () => {
    const request = new Request("https://example.com/api/test", {
      method: "OPTIONS",
    });
    const result = handleCorsPreflightRequest(request);
    expect(result?.status).toBe(204);
    expect(result?.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("applies custom origin on preflight", () => {
    const request = new Request("https://example.com/api/test", {
      method: "OPTIONS",
    });
    const result = handleCorsPreflightRequest(request, {
      allowOrigin: "https://example.com",
      maxAge: 3600,
    });
    expect(result?.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com"
    );
    expect(result?.headers.get("Access-Control-Max-Age")).toBe("3600");
  });

  it("returns empty body for preflight response", async () => {
    const request = new Request("https://example.com/api/test", {
      method: "OPTIONS",
    });
    const result = handleCorsPreflightRequest(request);
    const body = await result?.text();
    expect(body).toBe("");
  });
});

describe("resolveCorsOptions", () => {
  it("returns empty options when CORS_ALLOW_ORIGIN is unset", () => {
    const request = new Request("https://api.example.com", {
      headers: { Origin: "https://dashboard.hoox.sh" },
    });
    expect(resolveCorsOptions(request)).toEqual({});
  });

  it("echoes matching Origin from allowlist", () => {
    const request = new Request("https://api.example.com", {
      headers: { Origin: "https://dashboard.hoox.sh" },
    });
    expect(
      resolveCorsOptions(request, {
        CORS_ALLOW_ORIGIN: "https://dashboard.hoox.sh,https://app.hoox.sh",
      })
    ).toEqual({
      allowOrigin: "https://dashboard.hoox.sh",
      allowCredentials: true,
    });
  });

  it("returns empty options for unknown Origin", () => {
    const request = new Request("https://api.example.com", {
      headers: { Origin: "https://evil.example" },
    });
    expect(
      resolveCorsOptions(request, {
        CORS_ALLOW_ORIGIN: "https://dashboard.hoox.sh",
      })
    ).toEqual({});
  });
});
