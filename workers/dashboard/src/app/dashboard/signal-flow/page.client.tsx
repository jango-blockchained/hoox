"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignalFlowVisualization } from "@/components/dashboard/signal-flow-visualization";
import { PageHeader } from "@/components/dashboard/page-header";
import { BranchUp } from "reicon-react";
import Link from "next/link";

export default function SignalFlowClient() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={<BranchUp className="h-8 w-8 text-primary" />}
          title="Signal Flow"
          description="Operator map of how a signal moves: webhook → gateway → trade & agent → D1 → Telegram. Status and latency are live health checks — not a simulated demo."
        />
        <nav
          className="flex flex-wrap gap-2 text-sm"
          aria-label="Related operator views"
        >
          <Link
            href="/dashboard/signals"
            className="rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Signals
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

      <SignalFlowVisualization />
    </div>
  );
}
