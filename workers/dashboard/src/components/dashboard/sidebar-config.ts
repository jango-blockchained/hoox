/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { HooxIconName } from "@/components/ui/hoox-icon";

// Use semantic icon names from the Hoox registry for consistency
type Icon = HooxIconName;

// --- Types ---

export interface NavChildItem {
  title: string;
  href: string;
}

export interface NavItem {
  title: string;
  href: string;
  icon: Icon;
  children?: NavChildItem[];
}

export interface NavFooterItem {
  title: string;
  href: string;
  icon: Icon;
  external?: boolean;
}

// --- Primary Navigation ---

export const primaryNavItems: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: "overview" },
  { title: "Positions", href: "/dashboard/positions", icon: "positions" },
  { title: "Signal Flow", href: "/dashboard/signal-flow", icon: "signalFlow" },
  { title: "Analytics", href: "/dashboard/analytics", icon: "analytics" },
];

// --- Monitoring ---

export const monitoringNavItems: NavItem[] = [
  { title: "Logs", href: "/dashboard/logs", icon: "logs" },
  { title: "Signals", href: "/dashboard/signals", icon: "signals" },
  {
    title: "Notifications",
    href: "/dashboard/notifications",
    icon: "notifications",
  },
  { title: "Reports", href: "/dashboard/reports", icon: "reports" },
];

// --- System ---

export const systemNavItems: NavItem[] = [
  { title: "Database", href: "/dashboard/database", icon: "database" },
  {
    title: "Agent",
    href: "/dashboard/agent",
    icon: "agent",
    children: [
      { title: "Overview", href: "/dashboard/agent" },
      { title: "Chat", href: "/dashboard/agent/chat" },
      { title: "Vision", href: "/dashboard/agent/vision" },
      { title: "Reasoning", href: "/dashboard/agent/reasoning" },
      { title: "Models", href: "/dashboard/agent/models" },
      { title: "Risk", href: "/dashboard/agent/risk" },
      { title: "Usage", href: "/dashboard/agent/usage" },
    ],
  },
  { title: "Settings", href: "/dashboard/settings", icon: "settings" },
];

// --- Footer ---

export const footerNavItems: NavFooterItem[] = [
  {
    title: "Get Help",
    href: "https://github.com/jango-blockchained/hoox-setup/issues",
    icon: "help",
    external: true,
  },
  { title: "Setup", href: "/dashboard/setup", icon: "setup" },
  {
    title: "Search",
    href: "#",
    icon: "search",
  },
];

// --- Active Route Utility ---

export function isActiveRoute(
  pathname: string | null,
  itemHref: string
): boolean {
  if (!pathname) return false;
  if (pathname === itemHref) return true;
  // "/dashboard" should not match every sub-route
  if (itemHref === "/dashboard") return false;
  // Match sub-paths, e.g. /dashboard/agent/chat matches /dashboard/agent
  return pathname.startsWith(itemHref + "/");
}
