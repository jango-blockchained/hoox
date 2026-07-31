/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { FileX, Home, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * 404 page. Rendered by Next.js when no route matches.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid-bg opacity-40"
      />

      <p
        aria-hidden="true"
        className="relative font-heading text-8xl tracking-tight text-muted-foreground/25 sm:text-9xl"
      >
        404
      </p>

      <Empty className="relative border-dashed bg-card/50 backdrop-blur-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            The link may be broken, or the page may have moved. Use the command
            center or search to find what you need.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/dashboard">
                <Home data-icon="inline-start" aria-hidden="true" />
                Command Center
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/setup">
                <Search data-icon="inline-start" aria-hidden="true" />
                Setup Wizard
              </Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
