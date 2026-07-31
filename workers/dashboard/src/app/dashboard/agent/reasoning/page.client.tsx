"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentSubnav, ReasoningPanel } from "@/components/agent";
import { PageHeader } from "@/components/dashboard/page-header";
import { Brain } from "lucide-react";

export default function ReasoningClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Brain className="h-8 w-8 text-primary" />}
        title="Reasoning"
        description="Deep thinking queries with o1-style models"
      />
      <AgentSubnav />
      <ReasoningPanel />
    </div>
  );
}
