"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
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
  useSidebar,
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
  navSections,
  footerNavItems,
  isActiveRoute,
  isSectionActive,
  openCommandPalette,
  type NavItem,
} from "./sidebar-config";

function NavItemLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const sectionActive = isSectionActive(pathname, item);
  const selfActive = isActiveRoute(pathname, item.href, item.exact);

  if (item.children && item.children.length > 0) {
    return (
      <CollapsibleNavItem
        item={item}
        pathname={pathname}
        sectionActive={sectionActive}
        selfActive={selfActive}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={selfActive}
        tooltip={item.title}
        className="transition-colors"
      >
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={selfActive ? "page" : undefined}
        >
          <HooxIcon name={item.icon} size="sm" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function CollapsibleNavItem({
  item,
  pathname,
  sectionActive,
  selfActive,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  sectionActive: boolean;
  selfActive: boolean;
  onNavigate?: () => void;
}) {
  // Keep open when any child/section is active; allow user toggle.
  const [open, setOpen] = useState(sectionActive);

  useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive, pathname]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={selfActive || sectionActive}
            tooltip={item.title}
            className="transition-colors"
            aria-expanded={open}
          >
            <HooxIcon name={item.icon} size="sm" />
            <span>{item.title}</span>
            <ChevronDown
              className="ml-auto size-4 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180"
              aria-hidden="true"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children!.map((child) => {
              const childActive = isActiveRoute(
                pathname,
                child.href,
                child.exact ?? false
              );
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton asChild isActive={childActive}>
                    <Link
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={childActive ? "page" : undefined}
                    >
                      {child.title}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      {navSections.map((section) => (
        <SidebarGroup key={section.id}>
          {section.label ? (
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={handleNavigate}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}

      {/* Footer links — pushed to bottom via mt-auto */}
      <SidebarGroup className="mt-auto">
        <SidebarGroupContent>
          <SidebarMenu>
            {footerNavItems.map((item) => {
              if (item.action === "command-palette") {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={`${item.title} (⌘K)`}
                      className="transition-colors"
                      onClick={() => {
                        openCommandPalette();
                        handleNavigate();
                      }}
                    >
                      <HooxIcon name={item.icon} size="sm" />
                      <span>{item.title}</span>
                      <kbd className="ml-auto hidden rounded border border-sidebar-border bg-sidebar-accent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline-block">
                        ⌘K
                      </kbd>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              if (item.external) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <HooxIcon name={item.icon} size="sm" />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <Link href={item.href} onClick={handleNavigate}>
                      <HooxIcon name={item.icon} size="sm" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
