"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Server } from "lucide-react";
import { INFRASTRUCTURE_SECTIONS } from "./infrastructure/infrastructure-config";
import { InfrastructureRow } from "./infrastructure/infrastructure-row";
import { InfrastructureLegend } from "./infrastructure/infrastructure-legend";

export function DeployedInfrastructure() {
  return (
    <Card className="border-border bg-card shadow-2xl shadow-primary/5 backdrop-blur-xl">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Server strokeWidth={1.5} className="text-foreground/80 size-4" />
          <CardTitle className="text-base">Cloudflare Infrastructure</CardTitle>
          <span className="text-muted-foreground text-[10px] tracking-[0.08em] uppercase">
            Edge Network
          </span>
        </div>
        <CardDescription>
          Deployed serverless functions, pages, and storage backends
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid divide-y divide-border lg:grid-cols-[1fr_400px] lg:divide-x lg:divide-y-0">
          <div className="flex flex-col divide-y divide-border">
            {INFRASTRUCTURE_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <div
                  key={section.title}
                  className="flex flex-col gap-4 p-4"
                  aria-labelledby={`infra-section-${section.title}`}
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium tracking-tight text-foreground/80">
                    <Icon strokeWidth={1.5} className="size-4" />
                    <span id={`infra-section-${section.title}`}>
                      {section.title}
                    </span>
                    <Separator
                      orientation="horizontal"
                      className="ml-2 flex-1"
                    />
                    <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
                      {section.resources.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {section.resources.map((resource) => (
                      <InfrastructureRow
                        key={resource.name}
                        resource={resource}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <InfrastructureLegend />
        </div>
      </CardContent>
    </Card>
  );
}
