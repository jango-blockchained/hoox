"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignalFlowVisualization } from "@/components/dashboard/signal-flow-visualization";
import { PageHeader } from "@/components/dashboard/page-header";
import { BranchUp } from "reicon-react";

export default function SignalFlowClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<BranchUp className="h-8 w-8 text-primary" />}
        title="Signal Flow Pipeline"
        description="Real-time visualization of signal processing through workers"
      />

      <SignalFlowVisualization />
    </div>
  );
}
