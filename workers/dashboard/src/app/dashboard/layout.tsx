/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DashboardHeader } from "@/components/dashboard/header";
import { LiveTicker } from "@/components/dashboard/live-ticker";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { AmbientBackground } from "@/components/dashboard/ambient-background";
import { FirstRunRedirect } from "@/components/dashboard/setup/first-run-redirect";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { Footer } from "@/app/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Monitor your trading system in real-time. View positions, signals, and system health.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AmbientBackground>
      <SidebarProvider>
        <FirstRunRedirect />
        <AppSidebar variant="inset" />
        <SidebarInset
          id="main-content"
          tabIndex={-1}
          className="overflow-x-hidden outline-none"
        >
          <DashboardHeader />
          <LiveTicker />
          <div className="flex-1 p-4 pt-3 sm:p-6 lg:p-8">{children}</div>
          <Footer />
          <CommandPalette />
        </SidebarInset>
      </SidebarProvider>
    </AmbientBackground>
  );
}
