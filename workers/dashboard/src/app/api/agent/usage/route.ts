/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Errors } from "@hoox-sh/hoox-shared/errors";
import type { DashboardEnv } from "@/lib/env";
import { z } from "zod";

const providerUsageSchema = z.object({
  requests: z.number(),
  tokens: z.number(),
  cost: z.number(),
  avgLatency: z.number().optional(),
});

const usageSchema = z.record(z.string(), providerUsageSchema);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const env = getCloudflareContext().env as DashboardEnv;

    if (!env.CONFIG_KV) {
      return Errors.internal("CONFIG_KV not available");
    }

    const usageData = await env.CONFIG_KV.get("agent:usage");

    if (usageData) {
      try {
        const raw = JSON.parse(usageData);
        const parsed = usageSchema.safeParse(raw);
        if (parsed.success) {
          return NextResponse.json({ success: true, usage: parsed.data });
        }
        console.warn("agent/usage: Invalid usage data schema");
        // Return raw if shape is close enough for the UI to display
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          return NextResponse.json({
            success: true,
            usage: raw as Record<string, unknown>,
            note: "Usage data failed schema validation",
          });
        }
      } catch {
        console.warn("agent/usage: Failed to parse usage JSON");
      }
    }

    // Honest empty state — no fabricated provider stats
    return NextResponse.json({
      success: true,
      usage: {},
      note: "No usage data yet. Tracking requires the agent-worker to record metrics.",
    });
  } catch (e) {
    return Errors.internal(String(e));
  }
}
