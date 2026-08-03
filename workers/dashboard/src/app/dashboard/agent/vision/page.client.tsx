"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentSubnav, VisionUpload } from "@/components/agent";
import { PageHeader } from "@/components/dashboard/page-header";
import { Eye } from "lucide-react";

export default function VisionClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Eye className="h-8 w-8 text-primary" />}
        title="Vision Analysis"
        description="Analyze chart images with AI vision models"
      />
      <AgentSubnav />
      <VisionUpload />
    </div>
  );
}
