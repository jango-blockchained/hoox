"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Database } from "reicon-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DatabaseTableBrowser } from "@/components/dashboard/database-table-browser";

export default function DatabaseClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Database className="h-8 w-8 text-primary" />}
        title="Database Explorer"
        description="Read-only D1 browser — pick a table, inspect columns, preview recent rows"
      />
      <DatabaseTableBrowser />
    </div>
  );
}
