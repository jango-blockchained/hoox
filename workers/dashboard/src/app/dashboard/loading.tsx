/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard"
    >
      <span className="sr-only">Loading dashboard…</span>

      {/* Page header skeleton */}
      <div className="flex items-start gap-3">
        <Skeleton className="size-8 rounded-md shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 w-48 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Content panels */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-56 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
          <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
        <span
          className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-accent motion-reduce:animate-none"
          aria-hidden="true"
        />
        Loading…
      </div>
    </div>
  );
}
