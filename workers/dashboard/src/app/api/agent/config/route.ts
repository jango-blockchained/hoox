/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Errors } from "@jango-blockchained/hoox-shared/errors";
import type { DashboardEnv } from "@/lib/env";
import { agentConfigSchema } from "@/lib/agent-config-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const env = getCloudflareContext().env as DashboardEnv;

    if (env.CONFIG_KV) {
      const configData = await env.CONFIG_KV.get("agent:config");
      if (configData) {
        const raw = JSON.parse(configData);
        const parsed = agentConfigSchema.safeParse(raw);
        const config = parsed.success ? parsed.data : raw;
        if (!parsed.success) {
          console.warn("agent/config: Invalid agent config schema");
        }
        return NextResponse.json({ success: true, config });
      }
      return NextResponse.json({ success: true, config: null });
    }

    return NextResponse.json(
      { error: "CONFIG_KV not available" },
      { status: 500 }
    );
  } catch (e) {
    return Errors.internal(String(e));
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      defaultProvider?: string;
      fallbackChain?: string[];
      modelMap?: Record<string, string>;
      timeoutMs?: number;
      retryCount?: number;
      maxDailyDrawdownPercent?: number;
      trailingStopPercent?: number;
      takeProfitPercent?: number;
    };

    const env = getCloudflareContext().env as DashboardEnv;

    if (env.CONFIG_KV) {
      const existing = await env.CONFIG_KV.get("agent:config");
      const raw = existing ? JSON.parse(existing) : {};
      const parsed = agentConfigSchema.safeParse(raw);
      const config = parsed.success ? parsed.data : raw;
      if (!parsed.success) {
        console.warn("agent/config POST: Invalid existing config schema");
      }

      if (body.defaultProvider !== undefined)
        config.defaultProvider = body.defaultProvider;
      if (body.fallbackChain !== undefined)
        config.fallbackChain = body.fallbackChain;
      if (body.modelMap !== undefined) config.modelMap = body.modelMap;
      if (body.timeoutMs !== undefined) config.timeoutMs = body.timeoutMs;
      if (body.retryCount !== undefined) config.retryCount = body.retryCount;
      if (body.maxDailyDrawdownPercent !== undefined)
        config.maxDailyDrawdownPercent = body.maxDailyDrawdownPercent;
      if (body.trailingStopPercent !== undefined)
        config.trailingStopPercent = body.trailingStopPercent;
      if (body.takeProfitPercent !== undefined)
        config.takeProfitPercent = body.takeProfitPercent;

      await env.CONFIG_KV.put("agent:config", JSON.stringify(config));
      return NextResponse.json({ success: true, config });
    }

    return NextResponse.json(
      { error: "CONFIG_KV not available" },
      { status: 500 }
    );
  } catch (e) {
    return Errors.internal(String(e));
  }
}
