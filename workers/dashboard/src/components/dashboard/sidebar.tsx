"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SidebarNav } from "./sidebar-nav";
import { NavUser } from "./sidebar-user";
import Link from "next/link";
import { HooxIcon } from "@/components/ui/hoox-icon";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/dashboard" aria-label="Hoox dashboard home">
                <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <HooxIcon name="bolt" size="sm" className="size-4!" />
                </span>
                <span className="flex flex-col gap-0.5 leading-none">
                  <span className="text-base font-semibold tracking-tight">
                    Hoox
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    Edge Trading
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Dashboard">
          <SidebarNav />
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: "Hoox Trader",
            email: "trader@hoox.trade",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
