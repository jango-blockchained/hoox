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
        description="Browse D1 tables, inspect column schemas, and preview recent rows"
      />
      <DatabaseTableBrowser />
    </div>
  );
}
