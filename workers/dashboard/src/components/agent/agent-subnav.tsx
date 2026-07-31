"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  Brain,
  Eye,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
} from "lucide-react";

const AGENT_LINKS = [
  {
    href: "/dashboard/agent",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/dashboard/agent/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/agent/vision", label: "Vision", icon: Eye },
  { href: "/dashboard/agent/reasoning", label: "Reasoning", icon: Brain },
  { href: "/dashboard/agent/models", label: "Models", icon: Settings },
  { href: "/dashboard/agent/risk", label: "Risk", icon: Shield },
  { href: "/dashboard/agent/usage", label: "Usage", icon: BarChart3 },
] as const;

export function AgentSubnav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Agent sections"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/50 p-1"
    >
      {AGENT_LINKS.map(({ href, label, icon: Icon, ...rest }) => {
        const exact = "exact" in rest && rest.exact;
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
      <span className="ml-auto hidden items-center gap-1 px-2 text-xs text-muted-foreground sm:inline-flex">
        <Activity className="size-3" aria-hidden />
        Agent
      </span>
    </nav>
  );
}
