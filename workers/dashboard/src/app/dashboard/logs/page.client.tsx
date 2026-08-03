"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogsViewer } from "@/components/dashboard/logs-viewer";
import { PageHeader } from "@/components/dashboard/page-header";
import { DocText } from "reicon-react";

export default function LogsClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<DocText className="h-8 w-8 text-primary" />}
        title="System Logs"
        description="Production log explorer — filter by level and worker, search, auto-refresh, and copy lines"
      />
      <LogsViewer />
    </div>
  );
}
