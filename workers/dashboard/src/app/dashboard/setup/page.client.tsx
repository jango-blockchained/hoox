"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Setting2 } from "reicon-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { SetupWizard } from "@/components/dashboard/setup/setup-wizard";
import { DeployedInfrastructure } from "@/components/dashboard/deployed-infrastructure";

export default function SetupClient() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-6 md:p-8">
      <PageHeader
        as="h2"
        icon={<Setting2 className="text-primary size-8" />}
        title="Setup Wizard"
        description="First-run checklist — workers, automate mesh keys, webhook, go live"
      />
      <SetupWizard />
      <DeployedInfrastructure />
    </div>
  );
}
