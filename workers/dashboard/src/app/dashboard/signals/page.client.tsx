"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignalsTable } from "@/components/dashboard/signals-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Bolt } from "reicon-react";
import Link from "next/link";

export default function SignalsClient() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={<Bolt className="h-8 w-8 text-primary" />}
          title="Trade Signals"
          description="Inspect inbound signals from TradingView and other sources. Recent rows come from D1 trade_signals; aggregates come from Analytics Engine. Expand a row for metadata and raw payload when stored."
        />
        <nav
          className="flex flex-wrap gap-2 text-sm"
          aria-label="Related operator views"
        >
          <Link
            href="/dashboard/signal-flow"
            className="rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Signal Flow
          </Link>
          <Link
            href="/dashboard/logs"
            className="rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Logs
          </Link>
          <Link
            href="/dashboard/positions"
            className="rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Positions
          </Link>
        </nav>
      </div>

      <SignalsTable />
    </div>
  );
}
