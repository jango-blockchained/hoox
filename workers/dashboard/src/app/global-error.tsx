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
 * MUST render its own <html><body> wrapper.
 */
export default function GlobalError({
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
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          background: "#12141a",
          color: "#f2f2f0",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <main
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.5rem",
            textAlign: "center",
            maxWidth: "28rem",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: "3.5rem",
              height: "3.5rem",
              borderRadius: "9999px",
              background: "rgba(220, 60, 40, 0.15)",
              color: "#e85d4c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle style={{ width: "1.75rem", height: "1.75rem" }} />
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
              Critical Error
            </h1>
            <p style={{ margin: 0, fontSize: "0.875rem", opacity: 0.7 }}>
              {message}
            </p>
            {error?.digest ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  fontFamily: "ui-monospace, monospace",
                  opacity: 0.5,
                }}
              >
                Reference: {error.digest}
              </p>
            ) : null}
          </div>
          <Button variant="destructive" onClick={reset}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  );
}
