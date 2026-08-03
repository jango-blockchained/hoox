/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { HooxIcon, HooxIconName } from "@/components/ui/hoox-icon";

export type CFServiceType =
  | "D1"
  | "KV"
  | "R2"
  | "Queues"
  | "Workers AI"
  | "Vectorize"
  | "Durable Objects"
  | "Rate Limiting"
  | "Service Binding"
  | "Browser Rendering";

export type CFServiceCategory =
  | "Data"
  | "Compute"
  | "Messaging"
  | "Network"
  | "Rendering";

export interface CFServiceDef {
  name: string;
  description: string;
  category: CFServiceCategory;
  icon: HooxIconName;
}

export const CF_SERVICES: Record<CFServiceType, CFServiceDef> = {
  D1: {
    name: "D1",
    description: "Serverless SQL Database",
    category: "Data",
    icon: "database",
  },
  KV: {
    name: "KV",
    description: "Global Key-Value Store",
    category: "Data",
    icon: "chart", // using chart as proxy for key-value / data
  },
  R2: {
    name: "R2",
    description: "Object Storage",
    category: "Data",
    icon: "cloud",
  },
  Queues: {
    name: "Queues",
    description: "Message Queuing",
    category: "Messaging",
    icon: "signalFlow", // branch/flow for queuing
  },
  "Workers AI": {
    name: "Workers AI",
    description: "Serverless GPU Inference",
    category: "Compute",
    icon: "agent",
  },
  Vectorize: {
    name: "Vectorize",
    description: "Vector Database",
    category: "Data",
    icon: "chart",
  },
  "Durable Objects": {
    name: "Durable Objects",
    description: "Strong Consistency & State",
    category: "Compute",
    icon: "shield",
  },
  "Rate Limiting": {
    name: "Rate Limiting",
    description: "DDoS Protection & Traffic Control",
    category: "Network",
    icon: "shield",
  },
  "Service Binding": {
    name: "Service Binding",
    description: "Low-Latency Worker-to-Worker Comm",
    category: "Network",
    icon: "network",
  },
  "Browser Rendering": {
    name: "Browser Rendering",
    description: "Headless Browser Automation",
    category: "Rendering",
    icon: "eye",
  },
};

interface CFServiceBadgeProps {
  service: CFServiceType;
  mini?: boolean;
  /**
   * @deprecated Kept for backward compatibility. The redesigned badge
   * uses uniform styling across all services, so `isActive` no longer
   * changes appearance. Pass it through if you need the prop in your
   * call site, but the badge will look the same.
   */
  isActive?: boolean;
}

export function CFServiceBadge({
  service,
  mini = false,
  isActive: _isActive,
}: CFServiceBadgeProps) {
  const def = CF_SERVICES[service];
  if (!def) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "border-border/60 bg-transparent text-muted-foreground transition-colors",
              "hover:border-border hover:bg-muted/40 hover:text-foreground",
              "cursor-default",
              mini
                ? "h-5 gap-1 px-1.5 py-0 text-[10px] font-normal"
                : "h-6 gap-1.5 px-2 text-[11px] font-normal"
            )}
          >
            <HooxIcon
              name={def.icon}
              size={mini ? "xs" : "sm"}
              className="text-current"
            />
            <span className="tracking-tight whitespace-nowrap">{def.name}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="border-border bg-popover/95 px-2.5 py-1.5 backdrop-blur"
        >
          <p className="text-xs font-medium">{def.name}</p>
          <p className="text-muted-foreground text-[10px]">{def.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
