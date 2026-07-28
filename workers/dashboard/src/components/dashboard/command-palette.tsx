"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fragment, useEffect, useState } from "react";
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
  MessageSquare,
  ScrollText,
  Search,
  ShieldAlert,
  SunMoon,
} from "lucide-react";
import {
  Cpu,
  Database,
  BranchUp,
  Monitor,
  Radio,
  Setting2,
  Chart,
  Setting2 as WrenchIcon,
} from "reicon-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type CommandGroupName = "Navigation" | "Agent" | "Actions";

interface CommandPaletteItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  action: () => void;
  group: CommandGroupName;
}

const GROUP_ORDER: readonly CommandGroupName[] = [
  "Navigation",
  "Agent",
  "Actions",
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // useTheme() is safe to call without a ThemeProvider — next-themes returns
  // the default context (with a no-op setTheme) so we can still mirror the
  // change to the DOM and get immediate visual feedback.
  const { setTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigate = (path: string) => () => {
    setOpen(false);
    router.push(path);
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const isDark = root.classList.contains("dark");
    const next = isDark ? "light" : "dark";
    setTheme(next);
    // Mirror to DOM so theme changes immediately, even if no ThemeProvider
    // is mounted (the project layout doesn't include one yet).
    root.classList.toggle("dark", next === "dark");
    setOpen(false);
    toast.success(`Theme switched to ${next}`);
  };

  const commands: CommandPaletteItem[] = [
    // Navigation group — alphabetical
    {
      icon: BarChart3,
      label: "Analytics",
      action: navigate("/dashboard/analytics"),
      group: "Navigation",
    },
    {
      icon: Database,
      label: "Database",
      action: navigate("/dashboard/database"),
      group: "Navigation",
    },
    {
      icon: Monitor,
      label: "Dashboard",
      shortcut: "⌘D",
      action: navigate("/dashboard"),
      group: "Navigation",
    },
    {
      icon: Home,
      label: "Go to Home",
      shortcut: "⌘H",
      action: navigate("/"),
      group: "Navigation",
    },
    {
      icon: Bell,
      label: "Notifications",
      action: navigate("/dashboard/notifications"),
      group: "Navigation",
    },
    {
      icon: Chart,
      label: "Positions",
      shortcut: "⌘P",
      action: navigate("/dashboard/positions"),
      group: "Navigation",
    },
    {
      icon: FileText,
      label: "Reports",
      action: navigate("/dashboard/reports"),
      group: "Navigation",
    },
    {
      icon: Setting2,
      label: "Settings",
      shortcut: "⌘,",
      action: navigate("/dashboard/settings"),
      group: "Navigation",
    },
    {
      icon: WrenchIcon,
      label: "Setup",
      shortcut: "⌘S",
      action: navigate("/dashboard/setup"),
      group: "Navigation",
    },
    {
      icon: BranchUp,
      label: "Signal Flow",
      action: navigate("/dashboard/signal-flow"),
      group: "Navigation",
    },
    {
      icon: Radio,
      label: "Signals",
      action: navigate("/dashboard/signals"),
      group: "Navigation",
    },
    {
      icon: ScrollText,
      label: "System Logs",
      action: navigate("/dashboard/logs"),
      group: "Navigation",
    },

    // Agent group — overview + sub-routes
    {
      icon: Cpu,
      label: "Agent Overview",
      action: navigate("/dashboard/agent"),
      group: "Agent",
    },
    {
      icon: MessageSquare,
      label: "Agent Chat",
      action: navigate("/dashboard/agent/chat"),
      group: "Agent",
    },
    {
      icon: Eye,
      label: "Agent Vision",
      action: navigate("/dashboard/agent/vision"),
      group: "Agent",
    },
    {
      icon: Cpu,
      label: "Agent Reasoning",
      action: navigate("/dashboard/agent/reasoning"),
      group: "Agent",
    },
    {
      icon: Bot,
      label: "Agent Models",
      action: navigate("/dashboard/agent/models"),
      group: "Agent",
    },
    {
      icon: ShieldAlert,
      label: "Agent Risk",
      action: navigate("/dashboard/agent/risk"),
      group: "Agent",
    },
    {
      icon: Activity,
      label: "Agent Usage",
      action: navigate("/dashboard/agent/usage"),
      group: "Agent",
    },

    // Actions group — non-navigating commands
    {
      icon: Search,
      label: "Refresh Page",
      action: () => {
        setOpen(false);
        window.location.reload();
      },
      group: "Actions",
    },
    {
      icon: SunMoon,
      label: "Toggle Theme",
      action: toggleTheme,
      group: "Actions",
    },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command Palette"
        description="Search for pages and actions..."
      >
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {GROUP_ORDER.map((groupName, groupIdx) => (
            <Fragment key={groupName}>
              {groupIdx > 0 && <CommandSeparator />}
              <CommandGroup heading={groupName}>
                {commands
                  .filter((cmd) => cmd.group === groupName)
                  .map((cmd) => (
                    <CommandItem
                      key={cmd.label}
                      onSelect={cmd.action}
                      className="cursor-pointer"
                    >
                      <cmd.icon className="mr-2 h-4 w-4" />
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </Fragment>
          ))}
        </CommandList>
      </CommandDialog>

      {/* Cmd+K Hint */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2, duration: 0.5 }}
        className="fixed bottom-4 right-4 z-40"
      >
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-lg transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Search className="h-3 w-3" />
          <span>Search...</span>
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
      </motion.div>
    </>
  );
}
