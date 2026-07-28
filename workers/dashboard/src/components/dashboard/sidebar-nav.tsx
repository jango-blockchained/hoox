"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChevronDown } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HooxIcon } from "@/components/ui/hoox-icon";
import {
  primaryNavItems,
  monitoringNavItems,
  systemNavItems,
  footerNavItems,
  isActiveRoute,
  type NavItem,
} from "./sidebar-config";

function renderNavItem(item: NavItem, pathname: string | null) {
  const active = isActiveRoute(pathname, item.href);

  // Items with children get a Collapsible wrapper for expand/collapse.
  if (item.children && item.children.length > 0) {
    return (
      <Collapsible
        key={item.href}
        defaultOpen={active}
        className="group/collapsible"
      >
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={active && pathname === item.href}
              className="transition-colors"
            >
              <HooxIcon name={item.icon} size="sm" />
              <span>{item.title}</span>
              <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children.map((child) => (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActiveRoute(pathname, child.href)}
                  >
                    <Link href={child.href}>{child.title}</Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  return (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        asChild
        isActive={active}
        className="transition-colors"
      >
        <Link href={item.href}>
          <HooxIcon name={item.icon} size="sm" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Primary — no group label, flush at top */}
      <SidebarMenu>
        {primaryNavItems.map((item) => renderNavItem(item, pathname))}
      </SidebarMenu>

      {/* Monitoring */}
      <SidebarGroup>
        <SidebarGroupLabel>Monitoring</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {monitoringNavItems.map((item) => renderNavItem(item, pathname))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* System */}
      <SidebarGroup>
        <SidebarGroupLabel>System</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {systemNavItems.map((item) => renderNavItem(item, pathname))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Footer links — pushed to bottom via mt-auto */}
      <SidebarGroup className="mt-auto">
        <SidebarGroupContent>
          <SidebarMenu>
            {footerNavItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <a
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                  >
                    <HooxIcon name={item.icon} size="sm" />
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
