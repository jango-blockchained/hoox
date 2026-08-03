"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingsForm } from "@/components/dashboard/settings-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { Settings } from "lucide-react";

export default function SettingsClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Settings className="h-8 w-8 text-primary" />}
        title="Settings"
        description="Per-worker config — dirty state tracked, secrets via CLI only"
      />
      <SettingsForm />
    </div>
  );
}
