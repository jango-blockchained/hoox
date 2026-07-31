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
  /** When true, only exact pathname match counts as active */
  exact?: boolean;
}

export interface NavItem {
  title: string;
  href: string;
  icon: Icon;
  children?: NavChildItem[];
  /** When true, only exact pathname match counts as active */
  exact?: boolean;
}

export interface NavFooterItem {
  title: string;
  href: string;
  icon: Icon;
  external?: boolean;
  /** Dispatches a document event instead of navigating (e.g. command palette) */
  action?: "command-palette";
}

export interface NavSection {
  id: string;
  label: string | null;
  items: NavItem[];
}

// --- Primary Navigation ---

export const primaryNavItems: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: "overview", exact: true },
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
      { title: "Overview", href: "/dashboard/agent", exact: true },
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

// --- Section registry (sidebar + command palette + breadcrumbs) ---

export const navSections: NavSection[] = [
  { id: "primary", label: "Primary", items: primaryNavItems },
  { id: "monitoring", label: "Monitoring", items: monitoringNavItems },
  { id: "system", label: "System", items: systemNavItems },
];

// --- Footer ---

export const footerNavItems: NavFooterItem[] = [
  {
    title: "Search",
    href: "#",
    icon: "search",
    action: "command-palette",
  },
  { title: "Setup", href: "/dashboard/setup", icon: "setup" },
  {
    title: "Get Help",
    href: "https://github.com/jango-blockchained/hoox-setup/issues",
    icon: "help",
    external: true,
  },
];

// --- Route titles (breadcrumbs / document chrome) ---

export const routeTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/positions": "Positions",
  "/dashboard/signal-flow": "Signal Flow",
  "/dashboard/analytics": "Analytics",
  "/dashboard/logs": "Logs",
  "/dashboard/signals": "Signals",
  "/dashboard/notifications": "Notifications",
  "/dashboard/reports": "Reports",
  "/dashboard/database": "Database",
  "/dashboard/agent": "Agent",
  "/dashboard/agent/chat": "Chat",
  "/dashboard/agent/vision": "Vision",
  "/dashboard/agent/reasoning": "Reasoning",
  "/dashboard/agent/models": "Models",
  "/dashboard/agent/risk": "Risk",
  "/dashboard/agent/usage": "Usage",
  "/dashboard/settings": "Settings",
  "/dashboard/setup": "Setup",
};

/** Custom event name used to open the command palette from anywhere */
export const OPEN_COMMAND_PALETTE_EVENT = "hoox:open-command-palette";

export function openCommandPalette(): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}

// --- Active Route Utility ---

/**
 * Whether `pathname` matches a nav item.
 * - `exact: true` → only exact equality
 * - otherwise → exact match, or prefix match for nested routes
 * - `/dashboard` never matches sub-routes unless exact
 */
export function isActiveRoute(
  pathname: string | null,
  itemHref: string,
  exact = false
): boolean {
  if (!pathname) return false;
  if (pathname === itemHref) return true;
  if (exact) return false;
  // Overview must not light up for every dashboard page
  if (itemHref === "/dashboard") return false;
  return pathname.startsWith(itemHref + "/");
}

/** True when the pathname falls under a parent with children (for expand/highlight). */
export function isSectionActive(
  pathname: string | null,
  item: NavItem
): boolean {
  if (!pathname) return false;
  if (isActiveRoute(pathname, item.href, item.exact)) return true;
  if (!item.children?.length) return false;
  return item.children.some((child) =>
    isActiveRoute(pathname, child.href, child.exact ?? false)
  );
}

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

/** Build breadcrumb segments for a dashboard pathname. */
export function getBreadcrumbs(pathname: string | null): BreadcrumbSegment[] {
  if (!pathname || !pathname.startsWith("/dashboard")) {
    return [{ label: "Dashboard", href: "/dashboard" }];
  }

  const segments: BreadcrumbSegment[] = [
    { label: "Dashboard", href: "/dashboard" },
  ];

  if (pathname === "/dashboard") {
    return segments;
  }

  const parts = pathname
    .replace(/^\/dashboard\/?/, "")
    .split("/")
    .filter(Boolean);
  let acc = "/dashboard";

  for (let i = 0; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    const isLast = i === parts.length - 1;
    const label =
      routeTitles[acc] ??
      parts[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    segments.push({
      label,
      href: isLast ? undefined : acc,
    });
  }

  return segments;
}
