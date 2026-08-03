/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, mock, afterEach } from "bun:test";
import { TelegramService } from "./telegram-service.js";

describe("TelegramService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("setWebhook posts to Telegram API and returns ok", async () => {
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://api.telegram.org/botTOKEN/setWebhook"
        );
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body.url).toBe("https://example.com/hook");
        expect(body.secret_token).toBe("secret");
        return new Response(
          JSON.stringify({ ok: true, description: "Webhook was set" }),
          { status: 200 }
        );
      }
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const svc = new TelegramService();
    const result = await svc.setWebhook(
      "TOKEN",
      "https://example.com/hook",
      "secret"
    );
    expect(result.ok).toBe(true);
    expect(result.description).toBe("Webhook was set");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("setWebhook returns error when fetch throws", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const svc = new TelegramService();
    const result = await svc.setWebhook("TOKEN", "https://x", "s");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });

  it("getWebhookInfo returns webhook details on success", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://api.telegram.org/botTOKEN/getWebhookInfo"
      );
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            url: "https://example.com/hook",
            has_custom_certificate: false,
            pending_update_count: 3,
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const svc = new TelegramService();
    const result = await svc.getWebhookInfo("TOKEN");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://example.com/hook");
    expect(result.pending_update_count).toBe(3);
  });

  it("getWebhookInfo returns error when API ok=false", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ ok: false, description: "Unauthorized" }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const svc = new TelegramService();
    const result = await svc.getWebhookInfo("bad");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("getWebhookInfo returns error when fetch throws", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const svc = new TelegramService();
    const result = await svc.getWebhookInfo("TOKEN");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("fetch failed");
  });
});
