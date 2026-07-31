/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, ClipboardCopy, RefreshCw } from "lucide-react";
import {
  TIME_RANGE_OPTIONS,
  timeRangeLabel,
  type TimeRangeKey,
} from "./time-range";
import { cn } from "@/lib/utils";

export function AnalyticsToolbar({
  timeRange,
  onTimeRangeChange,
  onRefresh,
  summaryText,
  className,
}: {
  timeRange: TimeRangeKey;
  onTimeRangeChange: (range: TimeRangeKey) => void;
  onRefresh?: () => void;
  /** Plain-text snapshot for clipboard export. */
  summaryText?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text =
      summaryText ||
      `HOOX Analytics snapshot · ${timeRangeLabel(timeRange)} · ${new Date().toISOString()}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for restricted clipboard
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }, [summaryText, timeRange]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 sm:justify-end",
        className
      )}
    >
      <Select
        value={timeRange}
        onValueChange={(v) => onTimeRangeChange(v as TimeRangeKey)}
      >
        <SelectTrigger className="w-[150px]" size="sm" aria-label="Time range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <TooltipProvider delayDuration={200}>
        {onRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={onRefresh}
                aria-label="Refresh analytics"
              >
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh all panels</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleCopy()}
              className="gap-1.5"
            >
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <ClipboardCopy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy summary"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Copy a plain-text snapshot of the current range for ops chat /
            tickets
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
