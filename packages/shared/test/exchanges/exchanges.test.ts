/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  BaseExchangeClient,
  type TradeParams,
  type OrderResponse,
  type Position,
} from "../../src/exchanges/base-exchange-client";

describe("BaseExchangeClient", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function makeTestClient(impl?: {
    getErrorPrefix?: () => string;
    baseUrl?: string;
    genSig?: (p: Record<string, string | number | boolean>) => Promise<string>;
    buildHdrs?: (
      method: string,
      path: string,
      params?: Record<string, string | number | boolean>
    ) => Headers;
    exec?: (p: TradeParams) => Promise<OrderResponse>;
    acct?: () => Promise<Record<string, unknown>>;
    pos?: (s?: string) => Promise<Position[]>;
  }) {
    class TestClient extends BaseExchangeClient {
      protected getErrorMessagePrefix(): string {
        return impl?.getErrorPrefix ? impl.getErrorPrefix() : "";
      }
      protected getDefaultBaseUrl(): string {
        return impl?.baseUrl ?? "https://api.test.com";
      }
      protected async generateSignature(
        params: Record<string, string | number | boolean>
      ): Promise<string> {
        return impl?.genSig ? impl.genSig(params) : "test-signature";
      }
      protected buildHeaders(
        method: string,
        path: string,
        params?: Record<string, string | number | boolean>
      ): Headers {
        return impl?.buildHdrs
          ? impl.buildHdrs(method, path, params)
          : new Headers({ "X-Test": "true" });
      }
      async setLeverage(_symbol: string, _leverage: number): Promise<void> {}
      async executeTrade(params: TradeParams): Promise<OrderResponse> {
        if (impl?.exec) return impl.exec(params);
        return {
          orderId: "test-order",
          symbol: params.symbol,
          status: "filled",
        };
      }
      async getAccountInfo(): Promise<Record<string, unknown>> {
        return impl?.acct ? impl.acct() : { balance: 1000 };
      }
      async getPositions(symbol?: string): Promise<Position[]> {
        return impl?.pos ? impl.pos(symbol) : [];
      }
    }
    return new TestClient("test-key", "test-secret");
  }

  it("should instantiate with API credentials", () => {
    const client = makeTestClient();
    expect(client).toBeInstanceOf(BaseExchangeClient);
  });

  it("should throw error if API key is missing", () => {
    class TestClient extends BaseExchangeClient {
      protected getDefaultBaseUrl(): string {
        return "https://api.test.com";
      }
      protected async generateSignature(
        _params: Record<string, string | number | boolean>
      ): Promise<string> {
        return "test-signature";
      }
      protected buildHeaders(): Headers {
        return new Headers();
      }
      async setLeverage(): Promise<void> {}
      async executeTrade(_p: TradeParams): Promise<OrderResponse> {
        return { orderId: "x", symbol: "S", status: "ok" };
      }
      async getAccountInfo(): Promise<Record<string, unknown>> {
        return {};
      }
      async getPositions(): Promise<Position[]> {
        return [];
      }
    }
    expect(() => new TestClient("", "test-secret")).toThrow(
      "API key and secret are required."
    );
  });

  it("should throw error if API secret is missing", () => {
    class TestClient extends BaseExchangeClient {
      protected getDefaultBaseUrl(): string {
        return "https://api.test.com";
      }
      protected async generateSignature(
        _params: Record<string, string | number | boolean>
      ): Promise<string> {
        return "test-signature";
      }
      protected buildHeaders(): Headers {
        return new Headers();
      }
      async setLeverage(): Promise<void> {}
      async executeTrade(_p: TradeParams): Promise<OrderResponse> {
        return { orderId: "x", symbol: "S", status: "ok" };
      }
      async getAccountInfo(): Promise<Record<string, unknown>> {
        return {};
      }
      async getPositions(): Promise<Position[]> {
        return [];
      }
    }
    expect(() => new TestClient("test-key", "")).toThrow(
      "API key and secret are required."
    );
  });

  it("includes error message prefix from subclass on validation failure", () => {
    class PrefixedClient extends BaseExchangeClient {
      protected getErrorMessagePrefix(): string {
        return "BinanceClient: ";
      }
      protected getDefaultBaseUrl(): string {
        return "https://api.test.com";
      }
      protected async generateSignature(): Promise<string> {
        return "sig";
      }
      protected buildHeaders(): Headers {
        return new Headers();
      }
      async setLeverage(): Promise<void> {}
      async executeTrade(_p: TradeParams): Promise<OrderResponse> {
        return { orderId: "x", symbol: "S", status: "ok" };
      }
      async getAccountInfo(): Promise<Record<string, unknown>> {
        return {};
      }
      async getPositions(): Promise<Position[]> {
        return [];
      }
    }
    expect(() => new PrefixedClient("", "s")).toThrow(
      "BinanceClient: API key and secret are required."
    );
  });

  describe("convenience methods", () => {
    it("openLong delegates to executeTrade with BUY side", async () => {
      const exec = mock();
      const client = makeTestClient({
        exec: async (p) => {
          exec(p);
          return { orderId: "1", symbol: p.symbol, status: "new" };
        },
      });
      const res = await client.openLong("BTCUSDT", 0.5, 65000, "LIMIT");
      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec.mock.calls[0][0]).toMatchObject({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.5,
        price: 65000,
        orderType: "LIMIT",
      });
      expect(res.status).toBe("new");
    });

    it("openShort delegates to executeTrade with SELL side", async () => {
      const exec = mock();
      const client = makeTestClient({
        exec: async (p) => {
          exec(p);
          return { orderId: "2", symbol: p.symbol, status: "ok" };
        },
      });
      await client.openShort("ETHUSDT", 2, undefined, "MARKET");
      expect(exec.mock.calls[0][0]).toMatchObject({
        symbol: "ETHUSDT",
        side: "SELL",
        orderType: "MARKET",
      });
    });

    it("closeLong delegates to executeTrade with SELL + reduceOnly", async () => {
      const exec = mock();
      const client = makeTestClient({
        exec: async (p) => {
          exec(p);
          return { orderId: "3", symbol: p.symbol, status: "ok" };
        },
      });
      await client.closeLong("BTCUSDT", 0.1);
      expect(exec.mock.calls[0][0]).toMatchObject({
        symbol: "BTCUSDT",
        side: "SELL",
        quantity: 0.1,
        orderType: "MARKET",
        reduceOnly: true,
      });
    });

    it("closeShort delegates to executeTrade with BUY + reduceOnly", async () => {
      const exec = mock();
      const client = makeTestClient({
        exec: async (p) => {
          exec(p);
          return { orderId: "4", symbol: p.symbol, status: "ok" };
        },
      });
      await client.closeShort("SOLUSDT", 5);
      expect(exec.mock.calls[0][0]).toMatchObject({
        symbol: "SOLUSDT",
        side: "BUY",
        quantity: 5,
        reduceOnly: true,
      });
    });
  });

  describe("cryptoSign", () => {
    it("produces a lowercase hex signature using HMAC-SHA256", async () => {
      class SignClient extends BaseExchangeClient {
        protected getDefaultBaseUrl(): string {
          return "https://api.test.com";
        }
        protected async generateSignature(): Promise<string> {
          return "unused";
        }
        protected buildHeaders(): Headers {
          return new Headers();
        }
        async setLeverage(): Promise<void> {}
        async executeTrade(): Promise<OrderResponse> {
          return { orderId: "s", symbol: "S", status: "ok" };
        }
        async getAccountInfo(): Promise<Record<string, unknown>> {
          return {};
        }
        async getPositions(): Promise<Position[]> {
          return [];
        }
        public async testCryptoSign(data: string): Promise<string> {
          return this.cryptoSign(data);
        }
      }
      const client = new SignClient("k", "secret123");
      const sig = await client.testCryptoSign("payload-data");
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
      expect(sig.length).toBe(64);
      // calling again is deterministic for same input+key
      const sig2 = await client.testCryptoSign("payload-data");
      expect(sig2).toBe(sig);
    });
  });

  describe("fetch (via subclass)", () => {
    it("performs fetch with constructed URL, method, headers and POST body", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      class FetchingClient extends BaseExchangeClient {
        protected getDefaultBaseUrl(): string {
          return "https://api.test.com";
        }
        protected async generateSignature(): Promise<string> {
          return "siggy";
        }
        protected buildHeaders(
          _m: string,
          _p: string,
          _pa?: Record<string, string | number | boolean>
        ): Headers {
          const h = new Headers();
          h.set("X-API-KEY", this.apiKey);
          return h;
        }
        async setLeverage(): Promise<void> {}
        async executeTrade(params: TradeParams): Promise<OrderResponse> {
          // exercise protected fetch
          const data = await this.fetch<{ ok: boolean }>("POST", "/v1/order", {
            symbol: params.symbol,
            qty: params.quantity,
          });
          return {
            orderId: "f1",
            symbol: params.symbol,
            status: data.ok ? "filled" : "rej",
          };
        }
        async getAccountInfo(): Promise<Record<string, unknown>> {
          return {};
        }
        async getPositions(): Promise<Position[]> {
          return [];
        }
      }

      const client = new FetchingClient("mykey", "mysecret");
      const res = await client.executeTrade({
        symbol: "ADAUSDT",
        side: "BUY",
        quantity: 100,
      } as TradeParams);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.test.com/v1/order");
      expect(init.method).toBe("POST");
      expect((init.headers as Headers).get("X-API-KEY")).toBe("mykey");
      expect(init.body).toBe("symbol=ADAUSDT&qty=100");
      expect(res.status).toBe("filled");
    });

    it("throws on HTTP error response from exchange", async () => {
      mockFetch.mockResolvedValue(
        new Response("Bad Request: invalid symbol", { status: 400 })
      );

      class ErrClient extends BaseExchangeClient {
        protected getDefaultBaseUrl(): string {
          return "https://api.test.com";
        }
        protected async generateSignature(): Promise<string> {
          return "s";
        }
        protected buildHeaders(): Headers {
          return new Headers();
        }
        async setLeverage(): Promise<void> {}
        async executeTrade(_p: TradeParams): Promise<OrderResponse> {
          return await this.fetch<any>("GET", "/bad");
        }
        async getAccountInfo(): Promise<Record<string, unknown>> {
          return {};
        }
        async getPositions(): Promise<Position[]> {
          return [];
        }
      }

      const client = new ErrClient("k", "s");
      await expect(
        client.executeTrade({ symbol: "X", side: "BUY", quantity: 1 } as any)
      ).rejects.toThrow(/Exchange API error: 400/);
    });
  });

  describe("default implementations", () => {
    it("generateSignature default throws 'must be implemented'", async () => {
      class NoGen extends BaseExchangeClient {
        protected getDefaultBaseUrl(): string {
          return "https://api.test.com";
        }
        // intentionally do not override generateSignature to hit default
        protected buildHeaders(): Headers {
          return new Headers();
        }
        async setLeverage(): Promise<void> {}
        async executeTrade(): Promise<OrderResponse> {
          return { orderId: "d", symbol: "S", status: "ok" };
        }
        async getAccountInfo(): Promise<Record<string, unknown>> {
          return {};
        }
        async getPositions(): Promise<Position[]> {
          return [];
        }
        public async callGen(): Promise<string> {
          return this.generateSignature({});
        }
      }
      const c = new NoGen("k", "s");
      await expect(c.callGen()).rejects.toThrow(
        "generateSignature must be implemented by subclass"
      );
    });

    it("buildHeaders default returns empty Headers", () => {
      class NoBuild extends BaseExchangeClient {
        protected getDefaultBaseUrl(): string {
          return "https://api.test.com";
        }
        protected async generateSignature(): Promise<string> {
          return "s";
        }
        // no buildHeaders override
        async setLeverage(): Promise<void> {}
        async executeTrade(): Promise<OrderResponse> {
          return { orderId: "d", symbol: "S", status: "ok" };
        }
        async getAccountInfo(): Promise<Record<string, unknown>> {
          return {};
        }
        async getPositions(): Promise<Position[]> {
          return [];
        }
        public callBuild(): Headers {
          return this.buildHeaders("GET", "/x");
        }
      }
      const c = new NoBuild("k", "s");
      const h = c.callBuild();
      expect(h).toBeInstanceOf(Headers);
      // default impl just returns new Headers() with no entries
    });

    it("abstract stubs (setLeverage/executeTrade/getAccountInfo/getPositions) throw when not overridden", async () => {
      // Use the base directly via minimal subclass that leaves abstracts as-is
      class Minimal extends BaseExchangeClient {
        protected getDefaultBaseUrl(): string {
          return "https://api.test.com";
        }
        protected async generateSignature(): Promise<string> {
          return "s";
        }
        protected buildHeaders(): Headers {
          return new Headers();
        }
        // deliberately omit overrides for the public abstracts to hit throws
      }
      const c = new Minimal("k", "s") as any;
      expect(() => c.setLeverage("BTC", 10)).toThrow(
        "setLeverage must be implemented by subclass"
      );
      expect(() =>
        c.executeTrade({ symbol: "X", quantity: 1, side: "BUY" })
      ).toThrow("executeTrade must be implemented by subclass");
      expect(() => c.getAccountInfo()).toThrow(
        "getAccountInfo must be implemented by subclass"
      );
      expect(() => c.getPositions()).toThrow(
        "getPositions must be implemented by subclass"
      );
    });
  });
});
