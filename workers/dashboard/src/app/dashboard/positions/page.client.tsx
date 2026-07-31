"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChartCandlestick, ChevronDown, ChevronUp } from "lucide-react";

import { PositionsTable } from "@/components/dashboard/positions-table";
import { CandlestickChart } from "@/components/dashboard/candlestick-chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { HooxIcon } from "@/components/ui/hoox-icon";
import { Button } from "@/components/ui/button";

export default function PositionsClient() {
  const [showChart, setShowChart] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={<HooxIcon name="chart" size="lg" className="text-primary" />}
          title="Positions"
          description="Monitor and manage open trades across exchanges"
        />
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => setShowChart((v) => !v)}
            aria-expanded={showChart}
            aria-controls="positions-market-chart"
          >
            <ChartCandlestick className="h-4 w-4" aria-hidden />
            <span>{showChart ? "Hide chart" : "Show chart"}</span>
            {showChart ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showChart && (
          <motion.div
            id="positions-market-chart"
            key="positions-chart"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* No mock OHLC — chart shows a polished empty state until a live feed exists. */}
            <CandlestickChart
              data={[]}
              title="Market price action"
              description="Live OHLC feed is not wired yet"
              emptyTitle="No live candle data"
              emptyDescription="Connect a market data source to view price action here. Position marks and unrealized PnL still come from the trading ledger below."
            />
          </motion.div>
        )}
      </AnimatePresence>

      <PositionsTable />
    </div>
  );
}
