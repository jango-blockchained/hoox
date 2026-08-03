/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExchangeConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  testnet?: boolean;
}

/** Optional constructor options for exchange clients. */
export interface ExchangeClientOptions {
  /** Override the default API base URL. */
  baseUrl?: string;
  /** When true, use the exchange testnet/sandbox endpoint (if supported). */
  testnet?: boolean;
}

export interface TradeParams {
  symbol: string;
  side: string; // "BUY", "SELL", "long", "short", etc. - exchange-specific
  orderType?: string;
  quantity: number;
  price?: number;
  reduceOnly?: boolean;
  leverage?: number;
}

export interface OrderResponse {
  orderId: string;
  symbol: string;
  status: string;
  executedQty?: string;
  price?: string;
}

export interface Position {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  unrealizedPnl?: number;
}

/**
 * Base class for exchange clients. All exchange implementations must extend this.
 * Provides common functionality for exchange API clients including signature generation,
 * HTTP requests, and trade execution helpers.
 */
export abstract class BaseExchangeClient {
  protected readonly apiKey: string;
  protected readonly apiSecret: string;
  protected readonly baseUrl: string;
  protected readonly isTestnet: boolean;
  protected readonly importedKeyPromise: Promise<CryptoKey>;

  constructor(
    apiKey: string,
    apiSecret: string,
    options?: ExchangeClientOptions
  ) {
    if (!apiKey || !apiSecret) {
      throw new Error(
        this.getErrorMessagePrefix() + "API key and secret are required."
      );
    }
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    // isTestnet must be set before getDefaultBaseUrl() so subclasses
    // can return the testnet host when test mode is requested.
    this.isTestnet = options?.testnet ?? false;
    this.baseUrl = options?.baseUrl ?? this.getDefaultBaseUrl();
    this.importedKeyPromise = this.importKey();
  }

  /** Whether this client instance is targeting a testnet/sandbox host. */
  public get testnet(): boolean {
    return this.isTestnet;
  }

  /**
   * Returns the error message prefix for this client.
   * Subclasses can override to customize error messages.
   */
  protected getErrorMessagePrefix(): string {
    return "";
  }

  protected abstract getDefaultBaseUrl(): string;

  protected generateSignature(
    _params: Record<string, string | number | boolean>
  ): Promise<string> {
    throw new Error("generateSignature must be implemented by subclass");
  }

  protected buildHeaders(
    _method: string,
    _path: string,
    _params?: Record<string, string | number | boolean>
  ): Headers {
    return new Headers();
  }

  /**
   * Imports the API secret as a CryptoKey for HMAC-SHA256 signing.
   */
  private async importKey(): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    return crypto.subtle.importKey(
      "raw",
      encoder.encode(this.apiSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }

  /**
   * Signs data using HMAC-SHA256 with the API secret.
   */
  protected async cryptoSign(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await this.importedKeyPromise;
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(data)
    );
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  protected async fetch<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = this.buildHeaders(method, path, params);
    const body = params
      ? new URLSearchParams(params as Record<string, string>).toString()
      : undefined;

    const response = await fetch(url, {
      method,
      headers,
      body: method !== "GET" ? body : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Exchange API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  public setLeverage(_symbol: string, _leverage: number): Promise<void> {
    throw new Error("setLeverage must be implemented by subclass");
  }

  public executeTrade(_params: TradeParams): Promise<OrderResponse> {
    throw new Error("executeTrade must be implemented by subclass");
  }

  public getAccountInfo(): Promise<Record<string, unknown>> {
    throw new Error("getAccountInfo must be implemented by subclass");
  }

  public getPositions(_symbol?: string): Promise<Position[]> {
    throw new Error("getPositions must be implemented by subclass");
  }

  public async openLong(
    symbol: string,
    quantity: number,
    price?: number,
    orderType = "MARKET"
  ): Promise<OrderResponse> {
    return this.executeTrade({
      symbol,
      side: "BUY",
      orderType,
      quantity,
      price,
    });
  }

  public async openShort(
    symbol: string,
    quantity: number,
    price?: number,
    orderType = "MARKET"
  ): Promise<OrderResponse> {
    return this.executeTrade({
      symbol,
      side: "SELL",
      orderType,
      quantity,
      price,
    });
  }

  public async closeLong(
    symbol: string,
    quantity: number
  ): Promise<OrderResponse> {
    return this.executeTrade({
      symbol,
      side: "SELL",
      orderType: "MARKET",
      quantity,
      reduceOnly: true,
    });
  }

  public async closeShort(
    symbol: string,
    quantity: number
  ): Promise<OrderResponse> {
    return this.executeTrade({
      symbol,
      side: "BUY",
      orderType: "MARKET",
      quantity,
      reduceOnly: true,
    });
  }
}
