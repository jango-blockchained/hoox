"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { PositionsTable } from "@/components/dashboard/positions-table";
import { CandlestickChart } from "@/components/dashboard/candlestick-chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { HooxIcon } from "@/components/ui/hoox-icon";
import { motion } from "framer-motion";
import { useState } from "react";

// Mock data for demonstration
const mockCandleData = [
  { time: "2026-04-24", open: 67500, high: 68200, low: 67300, close: 68000 },
  { time: "2026-04-25", open: 68000, high: 68800, low: 67900, close: 68500 },
  { time: "2026-04-26", open: 68500, high: 69200, low: 68400, close: 69100 },
  { time: "2026-04-27", open: 69100, high: 69800, low: 68900, close: 69300 },
  { time: "2026-04-28", open: 69300, high: 70500, low: 69200, close: 70200 },
  { time: "2026-04-29", open: 70200, high: 71200, low: 70100, close: 70900 },
  { time: "2026-04-30", open: 70900, high: 71500, low: 70700, close: 71200 },
];

export default function PositionsClient() {
  const [showChart, setShowChart] = useState(true);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <PageHeader
          icon={<HooxIcon name="chart" size="lg" className="text-primary" />}
          title="Positions"
          description="Manage your active trading positions"
        />
        <div className="flex items-center gap-2 text-muted-foreground">
          <HooxIcon name="bitcoin" size="sm" />
          <HooxIcon name="wallet" size="sm" />
          <HooxIcon name="rocket" size="sm" />
          <HooxIcon name="target" size="sm" />
          <span className="text-xs">Trading</span>
        </div>
        <button
          onClick={() => setShowChart(!showChart)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {showChart ? "Hide Chart" : "Show Chart"}
        </button>
      </div>

      {showChart && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3 }}
        >
          <CandlestickChart
            data={mockCandleData}
            title="BTC/USDT Price Action"
            description="Last 7 days candlestick data"
            className="h-[350px]"
          />
        </motion.div>
      )}

      <PositionsTable />
    </div>
  );
}
