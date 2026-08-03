/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Ai } from "@cloudflare/workers-types";
import { Errors } from "@hoox-sh/hoox-shared/errors";
import type { DashboardEnv } from "@/lib/env";
import { agentConfigSchema } from "@/lib/agent-config-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      messages?: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }>;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    };

    const {
      messages,
      model,
      temperature = 0.7,
      maxTokens = 500,
      stream = true,
    } = body;

    if (!messages || messages.length === 0) {
      return Errors.badRequest("Messages are required");
    }

    const env = getCloudflareContext().env as DashboardEnv & { AI?: Ai };

    let selectedModel = model;
    if (!selectedModel && env.CONFIG_KV) {
      const configData = await env.CONFIG_KV.get("agent:config");
      if (configData) {
        const raw = JSON.parse(configData);
        const parsed = agentConfigSchema.safeParse(raw);
        const config = parsed.success ? parsed.data : raw;
        if (!parsed.success) {
          console.warn("agent/chat: Invalid agent config schema");
        }
        selectedModel =
          config.modelMap?.[config.defaultProvider] ||
          "@cf/meta/llama-3.1-8b-instruct";
      }
    }

    if (!selectedModel) {
      selectedModel = "@cf/meta/llama-3.1-8b-instruct";
    }

    if (stream && env.AI) {
      const encoder = new TextEncoder();
      const ai = env.AI;
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await ai.run(selectedModel, {
              messages,
              temperature,
              max_tokens: maxTokens,
              stream: true,
            });

            if (result && typeof result === "object" && "response" in result) {
              const aiStream = result.response as ReadableStream<Uint8Array>;
              if (aiStream && typeof aiStream.getReader === "function") {
                const reader = aiStream.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const chunk = new TextDecoder().decode(value);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ content: chunk })}\n\n`
                    )
                  );
                }
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (e) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: String(e) })}\n\n`
              )
            );
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (env.AI) {
      const ai = env.AI;
      const result = await ai.run(selectedModel, {
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      return NextResponse.json({
        success: true,
        response: (result as { response?: string }).response || String(result),
        model: selectedModel,
      });
    }

    return NextResponse.json(
      { error: "AI binding not available" },
      { status: 500 }
    );
  } catch (e) {
    return Errors.internal(String(e));
  }
}
