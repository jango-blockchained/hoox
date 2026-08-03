"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArrowDownRight, ArrowUpRight, Layers, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PositionsSummaryStats {
  openCount: number;
  totalUnrealizedPnl: number;
  longCount: number;
  shortCount: number;
  /** Optional notional for total open value when mark/entry prices exist. */
  totalNotional?: number;
  modeLabel?: string;
}

interface PositionsSummaryProps {
  stats: PositionsSummaryStats;
  className?: string;
  /** Dim metrics while data is loading. */
  loading?: boolean;
}

function formatUsd(value: number, signed = false): string {
  const abs = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (signed) {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}$${abs}`;
  }
  return `$${abs}`;
}

export function PositionsSummary({
  stats,
  className,
  loading = false,
}: PositionsSummaryProps) {
  const pnlPositive = stats.totalUnrealizedPnl > 0;
  const pnlNegative = stats.totalUnrealizedPnl < 0;

  const cards = [
    {
      key: "open",
      label: "Open positions",
      value: String(stats.openCount),
      hint: stats.modeLabel,
      icon: Layers,
      valueClass: "text-foreground",
    },
    {
      key: "pnl",
      label: "Unrealized PnL",
      value: formatUsd(stats.totalUnrealizedPnl, true),
      hint:
        stats.totalNotional != null && stats.totalNotional > 0
          ? `Notional ${formatUsd(stats.totalNotional)}`
          : undefined,
      icon: Wallet,
      valueClass: pnlPositive
        ? "text-success"
        : pnlNegative
          ? "text-destructive"
          : "text-foreground",
    },
    {
      key: "long",
      label: "Long",
      value: String(stats.longCount),
      hint:
        stats.openCount > 0
          ? `${Math.round((stats.longCount / stats.openCount) * 100)}% of book`
          : "No open longs",
      icon: ArrowUpRight,
      valueClass: "text-success",
    },
    {
      key: "short",
      label: "Short",
      value: String(stats.shortCount),
      hint:
        stats.openCount > 0
          ? `${Math.round((stats.shortCount / stats.openCount) * 100)}% of book`
          : "No open shorts",
      icon: ArrowDownRight,
      valueClass: "text-destructive",
    },
  ] as const;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-4",
        loading && "opacity-60",
        className
      )}
      role="region"
      aria-label="Positions summary"
      aria-busy={loading || undefined}
    >
      {cards.map(({ key, label, value, hint, icon: Icon, valueClass }) => (
        <div
          key={key}
          className="rounded-lg border border-border/60 bg-secondary/20 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", valueClass)}
              aria-hidden
            />
          </div>
          <p
            className={cn(
              "mt-1 text-lg font-bold tabular-nums tracking-tight",
              valueClass
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
