"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

const initialTickers: TickerItem[] = [
  { symbol: "BTC", price: 68420.5, change: 1170.5, changePercent: 1.74 },
  { symbol: "ETH", price: 3485.2, change: -34.8, changePercent: -0.99 },
  { symbol: "SOL", price: 145.8, change: 3.3, changePercent: 2.32 },
  { symbol: "DOGE", price: 0.1198, change: -0.0047, changePercent: -3.78 },
  { symbol: "XRP", price: 0.5234, change: 0.0156, changePercent: 3.07 },
  { symbol: "AVAX", price: 38.45, change: 0.87, changePercent: 2.32 },
];

export function LiveTicker() {
  const [tickers, setTickers] = useState(initialTickers);
  const [flashingSymbol, setFlashingSymbol] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * tickers.length);
      const ticker = tickers[randomIndex];
      const changeAmount = (Math.random() - 0.5) * ticker.price * 0.002;
      const newPrice = ticker.price + changeAmount;
      const newChange = ticker.change + changeAmount;
      const newChangePercent = (newChange / (newPrice - newChange)) * 100;

      setTickers((prev) =>
        prev.map((t, i) =>
          i === randomIndex
            ? {
                ...t,
                price: newPrice,
                change: newChange,
                changePercent: newChangePercent,
              }
            : t
        )
      );
      setFlashingSymbol(ticker.symbol);
      setTimeout(() => setFlashingSymbol(null), 300);
    }, 2000);

    return () => clearInterval(interval);
  }, [tickers]);

  return (
    <div className="relative overflow-hidden border-b border-border bg-sidebar/50">
      <div className="flex items-center gap-1 px-4 py-2">
        <Activity className="h-3 w-3 text-primary animate-pulse" />
        <span className="mr-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Live
        </span>
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
          <AnimatePresence mode="popLayout">
            {tickers.map((ticker) => (
              <motion.div
                key={ticker.symbol}
                className={`flex items-center gap-2 whitespace-nowrap transition-colors duration-300 ${
                  flashingSymbol === ticker.symbol
                    ? ticker.change >= 0
                      ? "bg-success/20"
                      : "bg-destructive/20"
                    : ""
                } rounded px-2 py-0.5`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <span className="text-xs font-medium text-foreground">
                  {ticker.symbol}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  $
                  {ticker.price < 1
                    ? ticker.price.toFixed(4)
                    : ticker.price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                </span>
                <div
                  className={`flex items-center gap-0.5 text-[10px] font-medium ${
                    ticker.change >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {ticker.change >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {ticker.changePercent >= 0 ? "+" : ""}
                  {ticker.changePercent.toFixed(2)}%
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
