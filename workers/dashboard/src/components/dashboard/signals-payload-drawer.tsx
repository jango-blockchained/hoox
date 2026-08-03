"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface SignalDetail {
  /** Display title for the drawer header */
  title: string;
  /** Optional subtitle under the title */
  subtitle?: string;
  /** Key/value metadata shown above the payload */
  fields: Array<{ label: string; value: string; mono?: boolean }>;
  /** Raw JSON / text payload when available */
  rawPayload?: string | null;
  /** Type badge text (e.g. BUY / SELL) */
  typeLabel?: string;
  typeClassName?: string;
  /** Status badge */
  statusLabel?: string;
  statusClassName?: string;
}

interface SignalsPayloadDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: SignalDetail | null;
}

function tryPrettyJson(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export function SignalsPayloadDrawer({
  open,
  onOpenChange,
  detail,
}: SignalsPayloadDrawerProps) {
  const pretty =
    detail?.rawPayload && detail.rawPayload.trim().length > 0
      ? tryPrettyJson(detail.rawPayload)
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        aria-describedby="signal-payload-description"
      >
        <SheetHeader className="border-b border-border px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <SheetTitle className="text-base">
              {detail?.title ?? "Signal detail"}
            </SheetTitle>
            {detail?.typeLabel ? (
              <Badge
                variant="outline"
                className={cn("border", detail.typeClassName)}
              >
                {detail.typeLabel}
              </Badge>
            ) : null}
            {detail?.statusLabel ? (
              <Badge
                variant="outline"
                className={cn("border", detail.statusClassName)}
              >
                {detail.statusLabel}
              </Badge>
            ) : null}
          </div>
          <SheetDescription id="signal-payload-description">
            {detail?.subtitle ??
              "Inspect signal metadata and the original raw payload."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
          {detail ? (
            <>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {detail.fields.map((field) => (
                  <div
                    key={field.label}
                    className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2"
                  >
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {field.label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 break-all text-sm text-foreground",
                        field.mono && "font-mono text-xs"
                      )}
                    >
                      {field.value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>

              <Separator />

              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Raw payload
                </h3>
                {pretty ? (
                  <ScrollArea className="h-[min(50vh,28rem)] rounded-lg border border-border bg-secondary/30">
                    <pre
                      className="p-3 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-all"
                      tabIndex={0}
                      aria-label="Raw signal payload"
                    >
                      {pretty}
                    </pre>
                  </ScrollArea>
                ) : (
                  <div
                    className="rounded-lg border border-dashed border-border bg-secondary/10 px-4 py-8 text-center text-sm text-muted-foreground"
                    role="status"
                  >
                    No raw payload stored for this row. Aggregated analytics
                    outcomes do not include original webhook bodies — open a
                    D1-backed signal row when available.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
