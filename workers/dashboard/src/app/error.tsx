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
 * Root error boundary. Rendered when a route outside `/dashboard` throws
 * (e.g. the auth route, the marketing `/` page, or any non-dashboard segment).
 *
 * Route-specific boundaries (e.g. `dashboard/error.tsx`) take precedence
 * within their own segment; this one is the last line of defense before
 * `global-error.tsx` kicks in.
 */
export default function RootError({
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
      : "An unexpected error occurred. Please try again.";

  return (
    <main
      role="alert"
      aria-live="assertive"
      className="flex min-h-svh flex-col items-center justify-center gap-6 p-4"
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset} variant="outline">
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild>
          <Link href="/dashboard">
            <Home data-icon="inline-start" aria-hidden="true" />
            Go to Dashboard
          </Link>
        </Button>
      </div>
    </main>
  );
}
