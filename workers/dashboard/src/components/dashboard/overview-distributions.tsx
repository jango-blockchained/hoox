"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DistributionChart, type DistributionData } from "./distribution-chart";
import { api, type Position } from "@/lib/api";

const EXCHANGE_FILLS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const SIDE_FILLS: Record<string, string> = {
  LONG: "var(--color-success)",
  BUY: "var(--color-success)",
  SHORT: "var(--color-destructive)",
  SELL: "var(--color-destructive)",
};

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

function deriveDistributions(positions: Position[]): {
  byExchange: DistributionData[];
  bySide: DistributionData[];
} {
  const exchangeCounts = new Map<string, number>();
  const sideCounts = new Map<string, number>();

  for (const raw of positions) {
    const p = raw as unknown as Record<string, unknown>;
    const exchange = (readStr(p, "exchange") ?? "unknown").toLowerCase();
    const side = (readStr(p, "side") ?? "unknown").toUpperCase();

    // Normalize side labels for the chart
    const sideLabel =
      side === "BUY"
        ? "Long"
        : side === "SELL"
          ? "Short"
          : side === "LONG"
            ? "Long"
            : side === "SHORT"
              ? "Short"
              : side;

    exchangeCounts.set(exchange, (exchangeCounts.get(exchange) ?? 0) + 1);
    sideCounts.set(sideLabel, (sideCounts.get(sideLabel) ?? 0) + 1);
  }

  const byExchange = Array.from(exchangeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: EXCHANGE_FILLS[i % EXCHANGE_FILLS.length],
    }));

  const bySide = Array.from(sideCounts.entries()).map(([name, value]) => ({
    name,
    value,
    fill:
      SIDE_FILLS[name.toUpperCase()] ??
      (name === "Long"
        ? "var(--color-success)"
        : name === "Short"
          ? "var(--color-destructive)"
          : "var(--color-chart-3)"),
  }));

  return { byExchange, bySide };
}

export function OverviewDistributions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getPositions();
      if (res.success) {
        setPositions(res.positions ?? []);
        setError(null);
      } else {
        setPositions([]);
        setError("Could not load positions for distribution");
      }
    } catch (err) {
      setPositions([]);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load position distribution"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const { byExchange, bySide } = useMemo(
    () => deriveDistributions(positions),
    [positions]
  );

  return (
    <div className="flex flex-col gap-6">
      <DistributionChart
        data={byExchange}
        title="Exchange Distribution"
        description="Open positions by exchange"
        type="donut"
        loading={loading}
        error={error}
        emptyTitle="No exchange exposure"
        emptyDescription="Positions will group by venue once the book is open."
      />
      <DistributionChart
        data={bySide}
        title="Position Sides"
        description="Long vs short distribution"
        type="pie"
        loading={loading}
        error={error}
        emptyTitle="No side exposure"
        emptyDescription="Long/short mix appears when positions are open."
      />
    </div>
  );
}
