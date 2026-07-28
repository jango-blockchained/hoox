/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Errors } from "@jango-blockchained/hoox-shared/errors";
import type { DashboardEnv } from "@/lib/env";
import { z } from "zod";

const usageSchema = z.record(
  z.string(),
  z.object({
    requests: z.number(),
    tokens: z.number(),
    cost: z.number(),
  })
);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const env = getCloudflareContext().env as DashboardEnv;

    if (env.CONFIG_KV) {
      const usageData = await env.CONFIG_KV.get("agent:usage");

      if (usageData) {
        const raw = JSON.parse(usageData);
        const parsed = usageSchema.safeParse(raw);
        const usage = parsed.success ? parsed.data : raw;
        if (!parsed.success) {
          console.warn("agent/usage: Invalid usage data schema");
        }
        return NextResponse.json({ success: true, usage });
      }

      return NextResponse.json({
        success: true,
        usage: {
          "workers-ai": { requests: 850, tokens: 300000, cost: 0.0 },
          openai: { requests: 320, tokens: 120000, cost: 9.6 },
          anthropic: { requests: 77, tokens: 30000, cost: 2.75 },
        },
        note: "Mock data - usage tracking requires agent-worker to be running",
      });
    }

    return Errors.internal("CONFIG_KV not available");
  } catch (e) {
    return Errors.internal(String(e));
  }
}
