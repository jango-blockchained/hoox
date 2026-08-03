"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
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
        description="Ops panel for Telegram alerts — send tests, apply templates, and review recent delivery"
      />
      <NotificationTester />
    </div>
  );
}
