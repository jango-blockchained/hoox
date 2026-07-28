/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import Link from "next/link";
import { FileX, Home } from "lucide-react";

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
 *
 * Composition: large "404" display + shadcn Empty state + Button(asChild + Link).
 * The dashed Empty border intentionally frames the empty state for visual emphasis.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <p
        aria-hidden="true"
        className="text-7xl font-bold tracking-tight text-muted-foreground/30 sm:text-8xl"
      >
        404
      </p>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Page Not Found</EmptyTitle>
          <EmptyDescription>
            Could not find the requested page. The link may be broken or the
            page may have been moved.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/dashboard">
              <Home data-icon="inline-start" aria-hidden="true" />
              Go to Dashboard
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
