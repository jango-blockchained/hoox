/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Legal notices, trademarks, and disclaimers for Hoox.
 * Centralized here so all surfaces (CLI, HTTP, Dashboard) use consistent text.
 */

export const COPYRIGHT = `Copyright (C) ${new Date().getFullYear()} Hoox Team. All rights reserved.`;

export const TRADEMARKS = [
  "TradingView\u00AE is a registered trademark of TradingView, Inc.",
  "Cloudflare\u00AE is a registered trademark of Cloudflare, Inc.",
] as const;

export const TRADEMARK_NOTICE = TRADEMARKS.join("\n");

export const DISCLAIMER =
  "DISCLAIMER: This software is provided for educational and informational purposes only. " +
  "Trading cryptocurrencies and other financial instruments involves substantial risk of loss. " +
  "No guarantee of profits or protection against losses is made or implied. " +
  "Past performance does not indicate future results. Use at your own risk.";

export const FULL_LEGAL_NOTICE = `${COPYRIGHT}\n\n${TRADEMARK_NOTICE}\n\n${DISCLAIMER}`;

export const DISCLAIMER_HEADER = "X-Disclaimer";
