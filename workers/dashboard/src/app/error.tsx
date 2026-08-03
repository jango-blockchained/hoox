"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Root error boundary. Rendered when a route outside `/dashboard` throws.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
      <div
        className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        <AlertTriangle className="size-7" />
      </div>

      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">{message}</p>
        {error?.digest ? (
          <p className="font-mono text-xs text-muted-foreground/70">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>

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
