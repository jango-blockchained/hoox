"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Eye,
  FileText,
  Home,
  Keyboard,
  MessageSquare,
  Moon,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Wrench,
} from "lucide-react";
import { Cpu, Database, BranchUp, Monitor, Radio, Chart } from "reicon-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  OPEN_COMMAND_PALETTE_EVENT,
  openCommandPalette,
} from "./sidebar-config";
import { Kbd } from "@/components/ui/kbd";

type CommandGroupName =
  | "Primary"
  | "Monitoring"
  | "System"
  | "Agent"
  | "Actions";

interface CommandPaletteItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  keywords?: string;
  shortcut?: string;
  action: () => void;
  group: CommandGroupName;
}

const GROUP_ORDER: readonly CommandGroupName[] = [
  "Primary",
  "Monitoring",
  "System",
  "Agent",
  "Actions",
];

const SUGGESTED_LABELS = [
  "Overview",
  "Positions",
  "Agent Chat",
  "Toggle Theme",
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      // Quick nav shortcuts when palette is closed and not typing in an input
      if (open) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        router.push("/dashboard");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, router]);

  useEffect(() => {
    const handler = () => openPalette();
    document.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handler);
    return () =>
      document.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handler);
  }, [openPalette]);

  const navigate = useCallback(
    (path: string) => () => {
      closePalette();
      router.push(path);
    },
    [closePalette, router]
  );

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
    closePalette();
    toast.success(`Theme switched to ${next}`);
  }, [resolvedTheme, setTheme, closePalette]);

  const commands: CommandPaletteItem[] = useMemo(
    () => [
      // Primary
      {
        icon: Monitor,
        label: "Overview",
        keywords: "dashboard home command center",
        shortcut: "⌘D",
        action: navigate("/dashboard"),
        group: "Primary",
      },
      {
        icon: Chart,
        label: "Positions",
        keywords: "trades open pnl",
        action: navigate("/dashboard/positions"),
        group: "Primary",
      },
      {
        icon: BranchUp,
        label: "Signal Flow",
        keywords: "pipeline webhook routing",
        action: navigate("/dashboard/signal-flow"),
        group: "Primary",
      },
      {
        icon: BarChart3,
        label: "Analytics",
        keywords: "metrics performance charts",
        action: navigate("/dashboard/analytics"),
        group: "Primary",
      },

      // Monitoring
      {
        icon: ScrollText,
        label: "System Logs",
        keywords: "log viewer debug",
        action: navigate("/dashboard/logs"),
        group: "Monitoring",
      },
      {
        icon: Radio,
        label: "Signals",
        keywords: "tradingview alerts",
        action: navigate("/dashboard/signals"),
        group: "Monitoring",
      },
      {
        icon: Bell,
        label: "Notifications",
        keywords: "telegram alerts",
        action: navigate("/dashboard/notifications"),
        group: "Monitoring",
      },
      {
        icon: FileText,
        label: "Reports",
        keywords: "pdf export",
        action: navigate("/dashboard/reports"),
        group: "Monitoring",
      },

      // System
      {
        icon: Database,
        label: "Database",
        keywords: "d1 tables schema",
        action: navigate("/dashboard/database"),
        group: "System",
      },
      {
        icon: Settings,
        label: "Settings",
        keywords: "config preferences",
        shortcut: "⌘,",
        action: navigate("/dashboard/settings"),
        group: "System",
      },
      {
        icon: Wrench,
        label: "Setup",
        keywords: "wizard onboarding first run",
        action: navigate("/dashboard/setup"),
        group: "System",
      },
      {
        icon: Home,
        label: "Go to Home",
        keywords: "root redirect",
        action: navigate("/"),
        group: "System",
      },

      // Agent
      {
        icon: Cpu,
        label: "Agent Overview",
        keywords: "ai risk manager",
        action: navigate("/dashboard/agent"),
        group: "Agent",
      },
      {
        icon: MessageSquare,
        label: "Agent Chat",
        keywords: "conversation llm",
        action: navigate("/dashboard/agent/chat"),
        group: "Agent",
      },
      {
        icon: Eye,
        label: "Agent Vision",
        keywords: "image chart analysis",
        action: navigate("/dashboard/agent/vision"),
        group: "Agent",
      },
      {
        icon: Cpu,
        label: "Agent Reasoning",
        keywords: "chain of thought",
        action: navigate("/dashboard/agent/reasoning"),
        group: "Agent",
      },
      {
        icon: Bot,
        label: "Agent Models",
        keywords: "llm providers",
        action: navigate("/dashboard/agent/models"),
        group: "Agent",
      },
      {
        icon: ShieldAlert,
        label: "Agent Risk",
        keywords: "kill switch parameters",
        action: navigate("/dashboard/agent/risk"),
        group: "Agent",
      },
      {
        icon: Activity,
        label: "Agent Usage",
        keywords: "tokens cost billing",
        action: navigate("/dashboard/agent/usage"),
        group: "Agent",
      },

      // Actions
      {
        icon: RefreshCw,
        label: "Refresh Page",
        keywords: "reload",
        action: () => {
          closePalette();
          window.location.reload();
        },
        group: "Actions",
      },
      {
        icon: resolvedTheme === "dark" ? Sun : Moon,
        label: "Toggle Theme",
        keywords: "dark light mode appearance",
        action: toggleTheme,
        group: "Actions",
      },
    ],
    [navigate, closePalette, toggleTheme, resolvedTheme]
  );

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command Palette"
        description="Search pages and run actions across the Hoox dashboard"
      >
        <CommandInput placeholder="Search pages, agent tools, actions…" />
        <CommandList>
          <CommandEmpty>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <Search
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  No results found
                </p>
                <p className="text-xs text-muted-foreground">
                  Try a route name, agent tool, or action keyword.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {SUGGESTED_LABELS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      const cmd = commands.find((c) => c.label === label);
                      cmd?.action();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CommandEmpty>

          {GROUP_ORDER.map((groupName, groupIdx) => {
            const items = commands.filter((cmd) => cmd.group === groupName);
            if (items.length === 0) return null;
            return (
              <Fragment key={groupName}>
                {groupIdx > 0 && <CommandSeparator />}
                <CommandGroup heading={groupName}>
                  {items.map((cmd) => (
                    <CommandItem
                      key={`${cmd.group}-${cmd.label}`}
                      value={`${cmd.label} ${cmd.keywords ?? ""} ${cmd.group}`}
                      onSelect={cmd.action}
                      className="cursor-pointer"
                    >
                      <cmd.icon className="mr-2 size-4 shrink-0 opacity-70" />
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            );
          })}
        </CommandList>

        {/* Shortcuts help footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Keyboard className="size-3" aria-hidden="true" />
              Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>↵</Kbd>
              <span>Open</span>
            </span>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Kbd>Esc</Kbd>
              <span>Close</span>
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </CommandDialog>

      {/* Floating Cmd+K affordance */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-40 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
        <button
          type="button"
          onClick={() => openCommandPalette()}
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border/80 bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open command palette"
        >
          <Search className="size-3" aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
          <Kbd className="font-mono text-[10px]">⌘K</Kbd>
        </button>
      </div>
    </>
  );
}
