"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  description?: string;
  as?: "h1" | "h2";
}

export function PageHeader({
  icon,
  title,
  description,
  as: Heading = "h1",
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        {icon}
      </motion.div>
      <div>
        <Heading className="text-2xl font-semibold text-foreground">
          {title}
        </Heading>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </motion.div>
  );
}
