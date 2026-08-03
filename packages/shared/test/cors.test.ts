/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for CORS middleware
 * Run with: bun test packages/shared/test/cors.test.ts
 */

import { describe, test, expect } from "bun:test";
import {
  corsHeaders,
  handleCorsPreflightRequest,
} from "../src/middleware/cors.js";

describe("corsHeaders", () => {
  test("does not set Allow-Origin by default (fail-closed)", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  test("allows custom origin", () => {
    const headers = corsHeaders({ allowOrigin: "https://example.com" });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });

  test("includes Access-Control-Allow-Methods", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Methods"]).toBe(
      "GET, POST, OPTIONS, PUT, DELETE"
    );
  });

  test("includes Access-Control-Allow-Headers", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Headers"]).toContain("Content-Type");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });

  test("includes maxAge", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Max-Age"]).toBe("86400");
  });

  test("includes credentials when allowCredentials is true", () => {
    const headers = corsHeaders({ allowCredentials: true });
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  test("omits credentials when allowCredentials is false", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  test("merges custom options with defaults", () => {
    const headers = corsHeaders({
      allowOrigin: "https://app.hoox.com",
      maxAge: 3600,
    });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.hoox.com");
    expect(headers["Access-Control-Max-Age"]).toBe("3600");
    // Defaults still apply
    expect(headers["Access-Control-Allow-Methods"]).toBe(
      "GET, POST, OPTIONS, PUT, DELETE"
    );
  });
});

describe("handleCorsPreflightRequest", () => {
  test("returns Response with correct headers for OPTIONS", () => {
    const request = new Request("https://api.hoox.com/trade", {
      method: "OPTIONS",
    });
    const response = handleCorsPreflightRequest(request);

    expect(response).toBeInstanceOf(Response);
    expect(response!.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response!.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS, PUT, DELETE"
    );
    expect(response!.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization"
    );
    expect(response!.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  test("returns Response with 204 status for OPTIONS", () => {
    const request = new Request("https://api.hoox.com/trade", {
      method: "OPTIONS",
    });
    const response = handleCorsPreflightRequest(request);
    expect(response!.status).toBe(204);
  });

  test("returns null for non-OPTIONS requests", () => {
    const getReq = new Request("https://api.hoox.com/trade", {
      method: "GET",
    });
    expect(handleCorsPreflightRequest(getReq)).toBeNull();

    const postReq = new Request("https://api.hoox.com/trade", {
      method: "POST",
    });
    expect(handleCorsPreflightRequest(postReq)).toBeNull();
  });

  test("returns OPTIONS response with custom origin", () => {
    const request = new Request("https://api.hoox.com/trade", {
      method: "OPTIONS",
    });
    const response = handleCorsPreflightRequest(request, {
      allowOrigin: "https://dashboard.hoox.com",
    });
    expect(response!.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://dashboard.hoox.com"
    );
  });
});
