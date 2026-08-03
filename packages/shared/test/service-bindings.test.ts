/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from "bun:test";
import {
  authenticatedServiceFetch,
  D1_READ_AUTH_KEY_FIELDS,
  DASHBOARD_D1_READ_AUTH_KEY_FIELDS,
  TELEGRAM_ALERT_AUTH_KEY_FIELDS,
  TRADE_EXECUTE_AUTH_KEY_FIELDS,
  resolveInternalAuthKey,
  ServiceAuthError,
  serviceFetch,
} from "../src/service-bindings";

describe("authenticatedServiceFetch", () => {
  test("injects X-Internal-Auth-Key from env", async () => {
    let capturedHeaders: Headers | undefined;
    const binding = {
      fetch: async (_url: string, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    };

    await authenticatedServiceFetch(
      binding,
      { INTERNAL_KEY_BINDING: "secret-key" },
      "/webhook",
      { action: "LONG" }
    );

    expect(capturedHeaders?.get("X-Internal-Auth-Key")).toBe("secret-key");
    expect(capturedHeaders?.get("Content-Type")).toBe("application/json");
  });

  test("rejects when INTERNAL_KEY_BINDING is missing (fail-closed)", async () => {
    const binding = {
      fetch: async () => new Response(null, { status: 200 }),
    };

    await expect(
      authenticatedServiceFetch(binding, {}, "/webhook", {})
    ).rejects.toBeInstanceOf(ServiceAuthError);
  });

  test("accepts internalKey override", async () => {
    let capturedHeaders: Headers | undefined;
    const binding = {
      fetch: async (_url: string, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(null, { status: 200 });
      },
    };

    await authenticatedServiceFetch(
      binding,
      {},
      "/alert",
      { message: "hi" },
      { internalKey: "telegram-specific-key" }
    );

    expect(capturedHeaders?.get("X-Internal-Auth-Key")).toBe(
      "telegram-specific-key"
    );
  });

  test("merges custom headers", async () => {
    let capturedHeaders: Headers | undefined;
    const binding = {
      fetch: async (_url: string, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(null, { status: 200 });
      },
    };

    await authenticatedServiceFetch(
      binding,
      { INTERNAL_KEY_BINDING: "k" },
      "/path",
      undefined,
      { method: "GET", headers: { "X-Request-ID": "req-1" } }
    );

    expect(capturedHeaders?.get("X-Request-ID")).toBe("req-1");
    expect(capturedHeaders?.get("X-Internal-Auth-Key")).toBe("k");
  });
});

describe("resolveInternalAuthKey", () => {
  test("returns first configured key from fallback list", () => {
    expect(
      resolveInternalAuthKey(
        { D1_READ_KEY_BINDING: "read-key", INTERNAL_KEY_BINDING: "full-key" },
        D1_READ_AUTH_KEY_FIELDS
      )
    ).toBe("read-key");
  });

  test("falls back to legacy INTERNAL_KEY_BINDING", () => {
    expect(
      resolveInternalAuthKey(
        { INTERNAL_KEY_BINDING: "full-key" },
        D1_READ_AUTH_KEY_FIELDS
      )
    ).toBe("full-key");
  });

  test("resolves dashboard D1 alias env vars", () => {
    expect(
      resolveInternalAuthKey(
        { D1_INTERNAL_KEY: "pages-d1-key" },
        DASHBOARD_D1_READ_AUTH_KEY_FIELDS
      )
    ).toBe("pages-d1-key");
  });

  test("prefers scoped trade execute key", () => {
    expect(
      resolveInternalAuthKey(
        {
          TRADE_EXECUTE_KEY_BINDING: "execute-key",
          INTERNAL_KEY_BINDING: "legacy",
        },
        TRADE_EXECUTE_AUTH_KEY_FIELDS
      )
    ).toBe("execute-key");
  });

  test("resolves telegram alert key from TELEGRAM_INTERNAL_KEY_BINDING", () => {
    expect(
      resolveInternalAuthKey(
        { TELEGRAM_INTERNAL_KEY_BINDING: "tg-key" },
        TELEGRAM_ALERT_AUTH_KEY_FIELDS
      )
    ).toBe("tg-key");
  });
});

describe("serviceFetch", () => {
  test("targets internal host prefix", async () => {
    let capturedUrl = "";
    const binding = {
      fetch: async (url: string) => {
        capturedUrl = String(url);
        return new Response(null, { status: 200 });
      },
    };

    await serviceFetch(binding, "/health");
    expect(capturedUrl).toBe("http://internal/health");
  });
});
