"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CFServiceBadge } from "@/components/ui/cf-service-badge";
import { cn } from "@/lib/utils";
import type { InfrastructureResource } from "./infrastructure-config";

interface InfrastructureRowProps {
  resource: InfrastructureResource;
}

export function InfrastructureRow({ resource }: InfrastructureRowProps) {
  const isActive = resource.status === "active";
  const hasUrl = Boolean(resource.url);
  const showActions = isActive && hasUrl && resource.kind !== "storage";

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border p-2.5 transition-colors",
        isActive
          ? "border-border/50 bg-secondary/15 hover:bg-secondary/30"
          : "border-border/20 bg-muted/10 opacity-80"
      )}
      title={resource.healthError}
    >
      <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{resource.name}</span>
          <StatusDot
            status={resource.status}
            kind={resource.kind}
            error={resource.healthError}
          />
          {resource.healthError && resource.kind === "worker" ? (
            <span className="truncate text-[10px] text-warning">
              {resource.healthError}
            </span>
          ) : null}
        </div>
        <span className="truncate text-[10px] text-muted-foreground">
          {resource.role}
        </span>
        {resource.services && resource.services.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {resource.services.map((service) => (
              <CFServiceBadge
                key={service}
                service={service}
                mini
                isActive={isActive}
              />
            ))}
          </div>
        )}
      </div>

      {resource.kind === "storage" ? (
        <Badge
          variant="outline"
          className="border-border/60 bg-transparent text-[10px] font-normal text-muted-foreground"
        >
          {resource.storageType}
        </Badge>
      ) : showActions ? (
        <RowActions url={resource.url!} name={resource.name} />
      ) : !isActive && resource.kind === "worker" ? (
        <Badge
          variant="outline"
          className="border-warning/40 text-[10px] font-normal text-warning"
        >
          Degraded
        </Badge>
      ) : null}
    </div>
  );
}

function StatusDot({
  status,
  kind,
  error,
}: {
  status: "active" | "inactive";
  kind: InfrastructureResource["kind"];
  error?: string;
}) {
  const label =
    status === "active"
      ? "Active"
      : kind === "worker"
        ? error
          ? `Inactive: ${error}`
          : "Inactive / unreachable"
        : "Inactive";

  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        status === "active"
          ? "bg-success shadow-[0_0_6px_rgba(16,185,129,0.5)]"
          : kind === "worker"
            ? "bg-warning"
            : "bg-muted-foreground/30"
      )}
    />
  );
}

function RowActions({ url, name }: { url: string; name: string }) {
  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard", { description: name });
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={copyUrl}
        aria-label={`Copy ${name} URL`}
      >
        <Copy className="size-3" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-6 text-muted-foreground hover:text-foreground"
        asChild
      >
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${name} in new tab`}
        >
          <ExternalLink className="size-3" />
        </a>
      </Button>
    </div>
  );
}
