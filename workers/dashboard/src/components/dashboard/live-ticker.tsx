"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import { api, type Position } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface TickerItem {
  id: string;
  symbol: string;
  exchange: string;
  side: string;
  price: number | null;
  pnl: number;
  pnlPercent: number | null;
}

function readNum(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function readStr(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function toTicker(position: Position): TickerItem {
  const p = position as unknown as Record<string, unknown>;
  const entry = readNum(p, "entryPrice", "entry_price") ?? 0;
  const current =
    readNum(p, "currentPrice", "current_price") ?? (entry > 0 ? entry : null);
  const pnl = readNum(p, "unrealizedPnl", "unrealized_pnl", "pnl") ?? 0;
  const size = readNum(p, "size", "quantity") ?? 0;
  const side = (readStr(p, "side") ?? "LONG").toUpperCase();
  let pnlPercent: number | null =
    readNum(p, "pnlPercent", "pnl_percent") ?? null;
  if (pnlPercent === null && entry > 0 && size > 0) {
    const notional = entry * size;
    if (notional > 0) pnlPercent = (pnl / notional) * 100;
  }

  const symbol = readStr(p, "symbol") ?? "—";
  const exchange = readStr(p, "exchange") ?? "";
  const id = String(p.id ?? `${exchange}-${symbol}-${side}`);

  return {
    id,
    symbol,
    exchange,
    side,
    price: current,
    pnl,
    pnlPercent,
  };
}

function formatPrice(price: number): string {
  if (price < 1) {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    });
  }
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortSymbol(symbol: string): string {
  return symbol.replace(/\/USDT$/i, "").replace(/USDT$/i, "");
}

export function LiveTicker() {
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getPositions();
      if (data.success && data.positions) {
        const items = data.positions
          .map(toTicker)
          .filter((t) => t.symbol !== "—");
        setTickers(items);
        setError(false);
      } else {
        setTickers([]);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div
      className="relative overflow-hidden border-b border-border bg-sidebar/50"
      role="region"
      aria-label="Open positions ticker"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <Activity
          className={cn(
            "h-3 w-3 shrink-0 text-primary",
            tickers.length > 0 && "animate-pulse"
          )}
          aria-hidden
        />
        <span className="mr-2 shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Book
        </span>

        {loading ? (
          <div className="flex flex-1 items-center gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-28 shrink-0" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-muted-foreground">
            Position feed unavailable
          </p>
        ) : tickers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No open positions ·{" "}
            <Link
              href="/dashboard/positions"
              className="text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View book
            </Link>
          </p>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
            <AnimatePresence mode="popLayout" initial={false}>
              {tickers.map((ticker) => {
                const positive = ticker.pnl >= 0;
                return (
                  <motion.div
                    key={ticker.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded px-2 py-0.5"
                  >
                    <span
                      className={cn(
                        "rounded px-1 text-[9px] font-semibold uppercase",
                        ticker.side === "LONG" || ticker.side === "BUY"
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive"
                      )}
                    >
                      {ticker.side === "BUY"
                        ? "L"
                        : ticker.side === "SELL"
                          ? "S"
                          : ticker.side.slice(0, 1)}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {shortSymbol(ticker.symbol)}
                    </span>
                    {ticker.exchange && (
                      <span className="hidden text-[10px] capitalize text-muted-foreground sm:inline">
                        {ticker.exchange}
                      </span>
                    )}
                    {ticker.price !== null && (
                      <span className="font-mono text-xs text-muted-foreground">
                        ${formatPrice(ticker.price)}
                      </span>
                    )}
                    <div
                      className={cn(
                        "flex items-center gap-0.5 text-[10px] font-medium",
                        positive ? "text-success" : "text-destructive"
                      )}
                    >
                      {positive ? (
                        <TrendingUp className="h-3 w-3" aria-hidden />
                      ) : (
                        <TrendingDown className="h-3 w-3" aria-hidden />
                      )}
                      <span className="font-mono">
                        {positive ? "+" : ""}
                        {ticker.pnl.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {ticker.pnlPercent !== null && (
                        <span className="opacity-80">
                          ({positive ? "+" : ""}
                          {ticker.pnlPercent.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {!loading && tickers.length > 0 && (
          <span className="ml-auto hidden shrink-0 text-[10px] text-muted-foreground md:inline">
            {tickers.length} open
          </span>
        )}
      </div>
    </div>
  );
}
