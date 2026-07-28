/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for operator transport profile + auth headers.
 */
import { describe, test, expect } from "bun:test";
import {
  resolveOperatorTransportProfile,
  buildOperatorAuthHeaders,
  hasOperatorClientCredentials,
  operatorUrl,
} from "../src/operator-transport";

describe("resolveOperatorTransportProfile", () => {
  test("defaults to public + localhost", () => {
    const p = resolveOperatorTransportProfile({});
    expect(p.transport).toBe("public");
    expect(p.apiBase).toBe("http://localhost:8787");
    expect(p.bearerToken).toBe("");
    expect(hasOperatorClientCredentials(p)).toBe(false);
  });

  test("reads HOOX_API_URL and HOOX_API_TOKEN", () => {
    const p = resolveOperatorTransportProfile({
      HOOX_API_URL: "https://mgmt.example.com///",
      HOOX_API_TOKEN: " secret ",
    });
    expect(p.apiBase).toBe("https://mgmt.example.com");
    expect(p.bearerToken).toBe("secret");
    expect(hasOperatorClientCredentials(p)).toBe(true);
  });

  test("auto-selects access when Access env present", () => {
    const p = resolveOperatorTransportProfile({
      CF_ACCESS_CLIENT_ID: "id",
      CF_ACCESS_CLIENT_SECRET: "sec",
    });
    expect(p.transport).toBe("access");
    expect(hasOperatorClientCredentials(p)).toBe(true);
  });

  test("HOOX_TRANSPORT overrides auto access", () => {
    const p = resolveOperatorTransportProfile({
      HOOX_TRANSPORT: "public",
      CF_ACCESS_CLIENT_ID: "id",
      CF_ACCESS_CLIENT_SECRET: "sec",
    });
    expect(p.transport).toBe("public");
  });

  test("accepts mtls and tunnel transport names", () => {
    expect(
      resolveOperatorTransportProfile({ HOOX_TRANSPORT: "mtls" }).transport
    ).toBe("mtls");
    expect(
      resolveOperatorTransportProfile({ HOOX_TRANSPORT: "tunnel" }).transport
    ).toBe("tunnel");
  });

  test("ignores unknown transport names", () => {
    expect(
      resolveOperatorTransportProfile({ HOOX_TRANSPORT: "warp" }).transport
    ).toBe("public");
  });

  test("uses config fallbacks when env unset", () => {
    const p = resolveOperatorTransportProfile(
      {},
      {
        configTransport: "access",
        configApiUrl: "https://from-config.example.com/",
        configApiToken: "from-file",
      }
    );
    expect(p.transport).toBe("access");
    expect(p.apiBase).toBe("https://from-config.example.com");
    expect(p.bearerToken).toBe("from-file");
  });

  test("env overrides config fallbacks", () => {
    const p = resolveOperatorTransportProfile(
      {
        HOOX_TRANSPORT: "public",
        HOOX_API_URL: "https://env.example.com",
        HOOX_API_TOKEN: "from-env",
      },
      {
        configTransport: "access",
        configApiUrl: "https://from-config.example.com",
        configApiToken: "from-file",
      }
    );
    expect(p.transport).toBe("public");
    expect(p.apiBase).toBe("https://env.example.com");
    expect(p.bearerToken).toBe("from-env");
  });
});

describe("buildOperatorAuthHeaders", () => {
  test("adds Bearer when token present", () => {
    const headers = buildOperatorAuthHeaders({
      transport: "public",
      apiBase: "https://x",
      bearerToken: "tok",
      accessClientId: "",
      accessClientSecret: "",
    });
    expect(headers).toEqual({ Authorization: "Bearer tok" });
  });

  test("adds Access headers for access transport", () => {
    const headers = buildOperatorAuthHeaders({
      transport: "access",
      apiBase: "https://x",
      bearerToken: "tok",
      accessClientId: "cid",
      accessClientSecret: "csec",
    });
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["CF-Access-Client-Id"]).toBe("cid");
    expect(headers["CF-Access-Client-Secret"]).toBe("csec");
  });

  test("adds Access headers when credentials present even on public", () => {
    const headers = buildOperatorAuthHeaders({
      transport: "public",
      apiBase: "https://x",
      bearerToken: "",
      accessClientId: "cid",
      accessClientSecret: "csec",
    });
    expect(headers["CF-Access-Client-Id"]).toBe("cid");
    expect(headers["CF-Access-Client-Secret"]).toBe("csec");
    expect(headers.Authorization).toBeUndefined();
  });

  test("omits Access headers without both credentials", () => {
    const headers = buildOperatorAuthHeaders({
      transport: "access",
      apiBase: "https://x",
      bearerToken: "",
      accessClientId: "cid",
      accessClientSecret: "",
    });
    expect(headers["CF-Access-Client-Id"]).toBeUndefined();
  });
});

describe("operatorUrl", () => {
  test("joins base and path", () => {
    const p = resolveOperatorTransportProfile({
      HOOX_API_URL: "https://mgmt.example.com/",
    });
    expect(operatorUrl(p, "/v1/workers")).toBe(
      "https://mgmt.example.com/v1/workers"
    );
    expect(operatorUrl(p, "v1/health")).toBe(
      "https://mgmt.example.com/v1/health"
    );
  });
});
