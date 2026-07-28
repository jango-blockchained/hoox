"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Dashboard segment error boundary. Rendered when any route under /dashboard
 * throws during render or data-fetching.
 *
 * Uses shadcn Alert (destructive) for the message and a Button with
 * RefreshCw for the retry action. `reset()` re-renders the segment without
 * unmounting the rest of the layout.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // In production, error.message may be scrubbed; fall back to a stable copy.
  const message =
    error?.message && error.message.length > 0
      ? error.message
      : "An unexpected error occurred while loading this page.";

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="flex h-[80vh] flex-col items-center justify-center gap-6 p-4"
    >
      <Alert variant="destructive" className="max-w-md">
        <AlertTriangle />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-2">
            <p>{message}</p>
            {error?.digest ? (
              <p className="text-xs text-muted-foreground/70 font-mono">
                Reference: {error.digest}
              </p>
            ) : null}
          </div>
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-2">
        <Button onClick={reset} variant="outline">
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </section>
  );
}
