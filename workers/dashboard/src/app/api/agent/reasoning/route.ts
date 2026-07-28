/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Ai } from "@cloudflare/workers-types";
import { Errors } from "@jango-blockchained/hoox-shared/errors";
import type { DashboardEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      model?: string;
      reasoningEffort?: "low" | "medium" | "high";
    };

    const { prompt, model = "o1-preview", reasoningEffort = "medium" } = body;

    if (!prompt) {
      return Errors.badRequest("Prompt is required");
    }

    const env = getCloudflareContext().env as DashboardEnv & { AI?: Ai };

    if (env.AI && model.includes("deepseek")) {
      const result = await env.AI.run(model, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
      });

      return NextResponse.json({
        success: true,
        reasoning: result.reasoning || "",
        answer: result.response || String(result),
        model,
      });
    }

    return NextResponse.json({
      success: true,
      reasoning: `[Mock Reasoning - ${reasoningEffort} effort]\nLet me think through this step by step...\n1. First, I need to understand the problem.\n2. Then, I should analyze the options.\n3. Finally, I'll provide a comprehensive answer.`,
      answer: `[Mock Answer for "${prompt}" using ${model}]\n\nThis is a simulated response. Configure API keys in CONFIG_KV for real responses.`,
      model,
      note: "External providers require API keys in CONFIG_KV",
    });
  } catch (e) {
    return Errors.internal(String(e));
  }
}
