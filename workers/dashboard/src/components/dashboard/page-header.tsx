"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Leading visual (icon, badge, avatar). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional trailing actions (buttons, filters, menus). */
  actions?: ReactNode;
  /** Optional content below the title row (tabs, filters bar). */
  children?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
  /** Suppress entrance animation (e.g. nested headers). */
  disableAnimation?: boolean;
}

export function PageHeader({
  icon,
  title,
  description,
  actions,
  children,
  as: Heading = "h1",
  className,
  disableAnimation = false,
}: PageHeaderProps) {
  const reduceMotion = useReducedMotion();
  const animate = !disableAnimation && !reduceMotion;

  return (
    <motion.header
      initial={animate ? { opacity: 0, y: -8 } : false}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <motion.div
              initial={animate ? { scale: 0.85, opacity: 0 } : false}
              animate={animate ? { scale: 1, opacity: 1 } : undefined}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="mt-0.5 shrink-0 text-primary [&_svg]:size-8"
              aria-hidden="true"
            >
              {icon}
            </motion.div>
          ) : null}
          <div className="min-w-0 space-y-1">
            <Heading className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </Heading>
            {description ? (
              <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </motion.header>
  );
}
