"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Dashboard segment error boundary. Rendered when any route under /dashboard
 * throws during render or data-fetching.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message =
    error?.message && error.message.length > 0
      ? error.message
      : "An unexpected error occurred while loading this page.";

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-4"
    >
      <div
        className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        <AlertTriangle className="size-7" />
      </div>

      <div className="max-w-md space-y-2 text-center">
        <h2 className="text-xl font-semibold tracking-tight">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">{message}</p>
        {error?.digest ? (
          <p className="font-mono text-xs text-muted-foreground/70">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>

      <Alert variant="destructive" className="max-w-md text-left">
        <AlertTriangle />
        <AlertTitle>Recovery options</AlertTitle>
        <AlertDescription>
          Retry this view, or return to the command center. If the problem
          persists, check system logs.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset} variant="outline">
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild>
          <Link href="/dashboard">
            <Home data-icon="inline-start" aria-hidden="true" />
            Command Center
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard/logs">View Logs</Link>
        </Button>
      </div>
    </section>
  );
}
