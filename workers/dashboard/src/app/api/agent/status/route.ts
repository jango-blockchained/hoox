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

/** KV key format: trade:watermark:{exchange}:{symbol}:{side} */
function parseWatermarkKey(key: string): {
  exchange: string;
  symbol: string;
  side: string;
} | null {
  const parts = key.split(":");
  if (parts.length < 5 || parts[0] !== "trade" || parts[1] !== "watermark") {
    return null;
  }
  const exchange = parts[2];
  const side = parts[parts.length - 1];
  const symbol = parts.slice(3, -1).join(":");
  if (!exchange || !symbol || !side) return null;
  return { exchange, symbol, side: side.toUpperCase() };
}

export async function GET(_request: NextRequest) {
  try {
    const env = getCloudflareContext().env as DashboardEnv;

    if (!env.CONFIG_KV) {
      return NextResponse.json(
        { success: false, error: "CONFIG_KV not available" },
        { status: 500 }
      );
    }

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

    const stops = await Promise.all(
      stopsList.keys.map(async (entry) => {
        const parsedKey = parseWatermarkKey(entry.name);
        const value = await env.CONFIG_KV!.get(entry.name);
        const watermark =
          value != null && value !== "" ? Number.parseFloat(value) : null;
        return {
          key: entry.name,
          exchange: parsedKey?.exchange ?? "unknown",
          symbol: parsedKey?.symbol ?? entry.name,
          side: parsedKey?.side ?? "UNKNOWN",
          watermark:
            watermark != null && Number.isFinite(watermark) ? watermark : null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      status: {
        killSwitch: killSwitch === "true",
        config,
        activeStops: stops.length,
        stops,
        lastCheck: new Date().toISOString(),
      },
    });
  } catch (e) {
    return Errors.internal(String(e));
  }
}
