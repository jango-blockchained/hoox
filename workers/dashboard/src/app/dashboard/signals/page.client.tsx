"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignalsTable } from "@/components/dashboard/signals-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Bolt } from "reicon-react";

export default function SignalsClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Bolt className="h-8 w-8 text-primary" />}
        title="Trade Signals"
        description="Drill-down view of all trading signals received from external sources"
      />

      <SignalsTable />
    </div>
  );
}
