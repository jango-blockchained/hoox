/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Errors } from "@jango-blockchained/hoox-shared/errors";
import type { DashboardEnv } from "@/lib/env";
import { agentConfigSchema } from "@/lib/agent-config-schema";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z
  .object({
    action: z.enum(["engage_kill_switch", "release_kill_switch"]).optional(),
    trailingStopPercent: z.number().min(0).max(1).optional(),
  })
  .refine(
    (b) => b.action !== undefined || b.trailingStopPercent !== undefined,
    { message: "No valid action specified" }
  );

export async function POST(request: NextRequest) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return Errors.badRequest("Invalid JSON body");
    }

    const parsedBody = bodySchema.safeParse(json);
    if (!parsedBody.success) {
      return Errors.badRequest(
        parsedBody.error.issues[0]?.message ?? "Invalid request body"
      );
    }

    const { action, trailingStopPercent } = parsedBody.data;
    const env = getCloudflareContext().env as DashboardEnv;

    if (!env.CONFIG_KV) {
      return Errors.internal("CONFIG_KV not available");
    }

    if (action === "engage_kill_switch") {
      await env.CONFIG_KV.put("trade:kill_switch", "true");
      return NextResponse.json({
        success: true,
        message: "Kill switch engaged - trading disabled",
      });
    }

    if (action === "release_kill_switch") {
      await env.CONFIG_KV.put("trade:kill_switch", "false");
      return NextResponse.json({
        success: true,
        message: "Kill switch released - trading enabled",
      });
    }

    if (trailingStopPercent !== undefined) {
      const configData = await env.CONFIG_KV.get("agent:config");
      const raw = configData ? JSON.parse(configData) : {};
      const parsed = agentConfigSchema.safeParse(raw);
      const config = parsed.success ? { ...parsed.data } : { ...raw };
      if (!parsed.success) {
        console.warn("agent/risk-override: Invalid agent config schema");
      }
      config.trailingStopPercent = trailingStopPercent;
      await env.CONFIG_KV.put("agent:config", JSON.stringify(config));
      return NextResponse.json({
        success: true,
        config,
        message: `Trailing stop updated to ${trailingStopPercent * 100}%`,
      });
    }

    return Errors.badRequest("No valid action specified");
  } catch (e) {
    return Errors.internal(String(e));
  }
}
