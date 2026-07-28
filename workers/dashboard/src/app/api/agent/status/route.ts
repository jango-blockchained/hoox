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
      const killSwitch = await env.CONFIG_KV.get("trade:kill_switch");
      const configData = await env.CONFIG_KV.get("agent:config");
      const raw = configData ? JSON.parse(configData) : null;
      const parsed = raw ? agentConfigSchema.safeParse(raw) : null;
      const config = parsed?.success ? parsed.data : raw;
      if (!parsed?.success && raw) {
        console.warn("agent/status: Invalid agent config schema");
      }

      const stopsList = await env.CONFIG_KV.list({
        prefix: "trade:watermark:",
      });

      return NextResponse.json({
        success: true,
        status: {
          killSwitch: killSwitch === "true",
          config,
          activeStops: stopsList.keys.length,
          lastCheck: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json(
      { error: "CONFIG_KV not available" },
      { status: 500 }
    );
  } catch (e) {
    return Errors.internal(String(e));
  }
}
