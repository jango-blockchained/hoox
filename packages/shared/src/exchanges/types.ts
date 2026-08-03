/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SupportedExchange = "binance" | "bybit" | "mexc";

export interface ExchangeOrder {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price?: number;
  leverage?: number;
  status: "PENDING" | "FILLED" | "CANCELED" | "FAILED";
}

export interface ExchangePosition {
  symbol: string;
  quantity: number;
  leverage: number;
  markPrice: number;
  unrealizedPnl: number;
  side: "LONG" | "SHORT";
}
