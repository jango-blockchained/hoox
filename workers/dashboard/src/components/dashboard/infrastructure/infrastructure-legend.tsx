/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CF_SERVICES,
  type CFServiceCategory,
  type CFServiceDef,
  type CFServiceType,
} from "@/components/ui/cf-service-badge";
import { HooxIcon } from "@/components/ui/hoox-icon";

const CATEGORY_ORDER: CFServiceCategory[] = [
  "Data",
  "Compute",
  "Messaging",
  "Network",
  "Rendering",
];

interface GroupedServices {
  category: CFServiceCategory;
  services: { type: CFServiceType; def: CFServiceDef }[];
}

function groupByCategory(): GroupedServices[] {
  const buckets = new Map<CFServiceCategory, GroupedServices["services"]>();
  for (const [type, def] of Object.entries(CF_SERVICES) as [
    CFServiceType,
    CFServiceDef,
  ][]) {
    const list = buckets.get(def.category) ?? [];
    list.push({ type, def });
    buckets.set(def.category, list);
  }
  return CATEGORY_ORDER.filter((c) => buckets.has(c)).map((category) => ({
    category,
    services: buckets.get(category) ?? [],
  }));
}

const GROUPED = groupByCategory();

export function InfrastructureLegend() {
  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">
          Infrastructure legend
        </h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Status dots and Cloudflare services powering the edge network
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-muted-foreground text-[10px] font-medium tracking-[0.08em] uppercase">
          Status
        </h4>
        <ul className="flex flex-col gap-1.5 text-xs">
          <li className="flex items-center gap-2.5">
            <span className="size-1.5 shrink-0 rounded-full bg-success shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span className="font-medium">Active</span>
            <span className="text-muted-foreground text-[11px]">
              Live · workers use CONFIG_KV probe
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            <span className="font-medium">Degraded</span>
            <span className="text-muted-foreground text-[11px]">
              Worker KV unreachable or error
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
            <span className="font-medium">Inactive</span>
            <span className="text-muted-foreground text-[11px]">
              Catalog-only (pages/storage)
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-5">
        {GROUPED.map(({ category, services }) => (
          <div key={category} className="flex flex-col gap-2">
            <h4 className="text-muted-foreground text-[10px] font-medium tracking-[0.08em] uppercase">
              {category}
            </h4>
            <ul className="flex flex-col gap-1.5">
              {services.map(({ type, def }) => {
                return (
                  <li
                    key={type}
                    className="flex items-baseline gap-2.5 text-xs"
                  >
                    <HooxIcon
                      name={def.icon}
                      size="sm"
                      className="text-muted-foreground"
                    />
                    <span className="w-14 shrink-0 font-medium tracking-tight text-foreground">
                      {def.name}
                    </span>
                    <span className="text-muted-foreground text-[11px] leading-tight">
                      {def.description}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
