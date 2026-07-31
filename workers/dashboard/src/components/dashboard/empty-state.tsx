"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  Chart,
  DocText,
  Setting2,
  BranchUp,
  Inbox,
  Plus,
  Refresh,
  Database,
  Bell,
  File,
  Cpu,
  Activity,
} from "reicon-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EmptyStateIconName =
  | "positions"
  | "logs"
  | "settings"
  | "setup"
  | "signal"
  | "inbox"
  | "database"
  | "notifications"
  | "reports"
  | "agent"
  | "analytics";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: "plus" | "refresh";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export interface EmptyStateProps {
  /** Preset icon name or a custom React node. */
  icon?: EmptyStateIconName | ReactNode;
  title: string;
  description: string;
  /** Primary call-to-action. */
  action?: EmptyStateAction;
  /** Secondary action (e.g. docs, clear filters). */
  secondaryAction?: EmptyStateAction;
  /** Compact padding for inline table empties. */
  size?: "default" | "sm" | "lg";
  className?: string;
  children?: ReactNode;
}

const iconMap: Record<
  EmptyStateIconName,
  React.ComponentType<{ className?: string }>
> = {
  positions: Chart,
  logs: DocText,
  settings: Setting2,
  setup: Setting2,
  signal: BranchUp,
  inbox: Inbox,
  database: Database,
  notifications: Bell,
  reports: File,
  agent: Cpu,
  analytics: Activity,
};

const actionIconMap = {
  plus: Plus,
  refresh: Refresh,
};

function isPresetIcon(
  icon: EmptyStateProps["icon"]
): icon is EmptyStateIconName {
  return typeof icon === "string" && icon in iconMap;
}

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  secondaryAction,
  size = "default",
  className,
  children,
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const PresetIcon = isPresetIcon(icon) ? iconMap[icon] : null;
  const ActionIcon = action?.icon ? actionIconMap[action.icon] : null;
  const SecondaryIcon = secondaryAction?.icon
    ? actionIconMap[secondaryAction.icon]
    : null;

  const padding =
    size === "sm" ? "py-10 px-4" : size === "lg" ? "py-24 px-6" : "py-16 px-4";

  const iconBox = size === "sm" ? "p-4" : size === "lg" ? "p-8" : "p-6";
  const iconSize =
    size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-12 w-12";

  return (
    <motion.div
      role="status"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        padding,
        className
      )}
    >
      <div className={cn("relative mb-5", size === "sm" && "mb-4")}>
        <div
          className="absolute inset-0 rounded-full bg-accent/10 blur-xl"
          aria-hidden="true"
        />
        <div
          className={cn(
            "relative rounded-full border border-border/60 bg-card/60 backdrop-blur-sm",
            iconBox
          )}
        >
          {PresetIcon ? (
            <PresetIcon className={cn(iconSize, "text-muted-foreground")} />
          ) : (
            <div
              className={cn(
                iconSize,
                "text-muted-foreground [&_svg]:size-full"
              )}
            >
              {icon as ReactNode}
            </div>
          )}
        </div>
      </div>

      <h3
        className={cn(
          "font-semibold text-foreground",
          size === "sm" ? "text-base mb-1" : "text-lg mb-2"
        )}
      >
        {title}
      </h3>

      <p
        className={cn(
          "text-muted-foreground max-w-sm text-pretty",
          size === "sm" ? "text-xs mb-4" : "text-sm mb-6"
        )}
      >
        {description}
      </p>

      {(action || secondaryAction || children) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant ?? "outline"}
              size={size === "sm" ? "sm" : "default"}
              className="gap-2"
            >
              {ActionIcon && <ActionIcon className="h-4 w-4" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant={secondaryAction.variant ?? "ghost"}
              size={size === "sm" ? "sm" : "default"}
              className="gap-2"
            >
              {SecondaryIcon && <SecondaryIcon className="h-4 w-4" />}
              {secondaryAction.label}
            </Button>
          )}
          {children}
        </div>
      )}
    </motion.div>
  );
}
