"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Last-resort error boundary. Rendered when the root layout itself fails.
 *
 * MUST be a client component (Next.js requirement) and MUST render its own
 * <html><body> wrapper — the root layout does NOT run for this route.
 *
 * Kept intentionally minimal: one icon, the error message, and a retry button.
 * The Button component is a stable client primitive that survives even when
 * other modules have failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // In production, error.message is scrubbed for client-side errors; fall back
  // to a stable copy so we never render "undefined".
  const message =
    error?.message && error.message.length > 0
      ? error.message
      : "An unexpected error occurred. Please try again.";

  return (
    <html lang="en" className="dark bg-background">
      <body className="min-h-svh bg-background text-foreground font-sans antialiased">
        <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-4 text-center">
          <div
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          >
            <AlertTriangle className="size-7" />
          </div>
          <div className="flex max-w-md flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Critical Error
            </h1>
            <p className="text-sm text-muted-foreground text-balance">
              {message}
            </p>
            {error?.digest ? (
              <p className="text-xs text-muted-foreground/70 font-mono">
                Reference: {error.digest}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="destructive" onClick={reset}>
              <AlertTriangle data-icon="inline-start" aria-hidden="true" />
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
