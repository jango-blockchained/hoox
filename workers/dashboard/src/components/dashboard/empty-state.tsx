"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from "framer-motion";
import {
  Chart,
  DocText,
  Setting2,
  Setting2 as WrenchIcon, // approx for wrench/setup
  BranchUp,
  Inbox,
  Plus,
  Refresh,
} from "reicon-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: "positions" | "logs" | "settings" | "setup" | "signal" | "inbox";
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: "plus" | "refresh";
  };
}

const iconMap = {
  positions: Chart,
  logs: DocText,
  settings: Setting2,
  setup: WrenchIcon,
  signal: BranchUp,
  inbox: Inbox,
};

const actionIconMap = {
  plus: Plus,
  refresh: Refresh,
};

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
}: EmptyStateProps) {
  const Icon = iconMap[icon];
  const ActionIcon = action?.icon ? actionIconMap[action.icon] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        className="relative mb-6"
      >
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl" />
        <div className="relative bg-background/50 backdrop-blur-sm border border-border/50 rounded-full p-6">
          <Icon className="h-12 w-12 text-muted-foreground" />
        </div>
      </motion.div>

      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-lg font-semibold text-foreground mb-2"
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-sm text-muted-foreground text-center max-w-sm mb-6"
      >
        {description}
      </motion.p>

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button onClick={action.onClick} variant="outline" className="gap-2">
            {ActionIcon && <ActionIcon className="h-4 w-4" />}
            {action.label}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
