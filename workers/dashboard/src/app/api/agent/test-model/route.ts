/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Ai } from "@cloudflare/workers-types";
import { Errors } from "@hoox-sh/hoox-shared/errors";
import type { DashboardEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      provider?: string;
      model?: string;
      prompt?: string;
    };

    const { provider = "workers-ai", model, prompt = "Say hello" } = body;

    const env = getCloudflareContext().env as DashboardEnv & { AI?: Ai };

    const start = Date.now();

    if (provider === "workers-ai" && env.AI && model) {
      try {
        const result = await env.AI.run(model, {
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100,
        });
        return NextResponse.json({
          success: true,
          provider,
          model,
          response: result?.response || String(result),
          latency: Date.now() - start,
        });
      } catch (e) {
        return NextResponse.json({
          success: false,
          provider,
          model,
          error: String(e),
          latency: Date.now() - start,
        });
      }
    }

    return NextResponse.json({
      success: true,
      provider,
      model: model || "unknown",
      response: `[Mock] ${provider} would respond to: ${prompt}`,
      latency: Date.now() - start,
      note: "External providers require API keys in KV",
    });
  } catch (e) {
    return Errors.internal(String(e));
  }
}
