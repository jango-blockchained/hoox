/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  BarChart3,
  Info,
  Inbox,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import type { AnalyticsQueryError } from "./use-analytics-query";

const CARD_CHROME =
  "border-border bg-card/80 backdrop-blur-xl shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5";

export function MetricInfo({
  label,
  children,
  side = "top",
}: {
  label?: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={label ?? "Metric info"}
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-xs text-left leading-relaxed"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AnalyticsCard({
  title,
  description,
  icon: Icon,
  info,
  action,
  children,
  className,
  contentClassName,
  delay = 0,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  info?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={cn("min-w-0", className)}
    >
      <Card className={cn(CARD_CHROME, "h-full")}>
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">{title}</CardTitle>
                {info && (
                  <MetricInfo label={`About ${title}`}>{info}</MetricInfo>
                )}
              </div>
              {description && (
                <CardDescription className="text-pretty">
                  {description}
                </CardDescription>
              )}
            </div>
          </div>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
        <CardContent className={cn("pt-4", contentClassName)}>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function AnalyticsCardSkeleton({
  height = "h-[220px]",
  className,
}: {
  height?: string;
  className?: string;
}) {
  return (
    <Card className={cn(CARD_CHROME, className)}>
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <Skeleton className={cn("w-full rounded-lg", height)} />
      </CardContent>
    </Card>
  );
}

export function AnalyticsEmpty({
  title = "No data yet",
  description = "The analytics-worker has not recorded events for this view. Data appears once trades, signals, or worker heartbeats are tracked.",
  icon: Icon = Inbox,
  action,
  compact,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Empty
      className={cn(
        "border-0 p-4 md:p-8",
        compact && "min-h-[140px] gap-3 p-4 md:p-6"
      )}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle className={cn(compact && "text-base")}>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function AnalyticsErrorState({
  error,
  onRetry,
  compact,
}: {
  error: AnalyticsQueryError;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <Empty
      className={cn(
        "border-0 p-4 md:p-8",
        compact && "min-h-[140px] gap-3 p-4 md:p-6"
      )}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircle className="text-destructive" />
        </EmptyMedia>
        <EmptyTitle className={cn(compact && "text-base")}>
          Couldn’t load analytics
        </EmptyTitle>
        <EmptyDescription>{error.message}</EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

export function AnalyticsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <Card className={cn(CARD_CHROME)}>
      <CardContent className="flex flex-col gap-3 pt-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

/** Compact KPI tile used in the top row of the analytics command surface. */
export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  info,
  tone = "default",
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  info?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
  delay?: number;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="min-w-0"
    >
      <Card className={cn(CARD_CHROME, "h-full")}>
        <CardContent className="flex flex-col gap-2 pt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {Icon && <Icon className="size-3.5 text-primary" />}
              <span className="truncate">{label}</span>
              {info && <MetricInfo label={`About ${label}`}>{info}</MetricInfo>}
            </div>
          </div>
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl",
              toneClass
            )}
          >
            {value}
          </div>
          {hint && (
            <div className="text-xs text-muted-foreground text-pretty">
              {hint}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      <BarChart3 className="size-3.5" />
      {children}
    </div>
  );
}
