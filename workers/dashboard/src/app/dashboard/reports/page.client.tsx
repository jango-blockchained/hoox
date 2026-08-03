"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { PageHeader } from "@/components/dashboard/page-header";
import { ReportsList } from "@/components/dashboard/reports-list";
import { FileText } from "reicon-react";

export default function ReportsClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<FileText className="h-8 w-8 text-primary" />}
        title="Reports"
        description="PDF and CSV reports from report-worker — filter, download, and regenerate on demand"
      />
      <ReportsList />
    </div>
  );
}
