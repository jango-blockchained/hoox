"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bell } from "reicon-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { NotificationTester } from "@/components/dashboard/notification-tester";

export default function NotificationsClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Bell className="h-8 w-8 text-primary" />}
        title="Notifications"
        description="Test and manage telegram alerts from the trading system"
      />
      <NotificationTester />
    </div>
  );
}
