/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { Errors } from "@hoox-sh/hoox-shared/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const models = {
      "workers-ai": [
        { id: "@cf/meta/llama-3.1-8b-instruct", taskType: "chat" },
        { id: "@cf/meta/llama-3.2-11b-vision-instruct", taskType: "vision" },
        {
          id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
          taskType: "reasoning",
        },
        { id: "@cf/qwen/qwen2.5-coder-32b-instruct", taskType: "code" },
        { id: "@cf/baai/bge-base-en-v1.5", taskType: "embedding" },
        { id: "@cf/facebook/bart-large-cnn", taskType: "summarization" },
      ],
      openai: [
        { id: "gpt-4o-mini-2024-07-18", taskType: "chat" },
        { id: "gpt-4o-2024-08-06", taskType: "chat" },
        { id: "o1-preview", taskType: "reasoning" },
        { id: "o1-mini", taskType: "reasoning" },
      ],
      anthropic: [
        { id: "claude-3-haiku-20240307", taskType: "chat" },
        { id: "claude-3-sonnet-20240229", taskType: "chat" },
        { id: "claude-3-opus-20240229", taskType: "chat" },
      ],
      google: [
        { id: "gemini-1.5-flash-002", taskType: "chat" },
        { id: "gemini-1.5-pro-002", taskType: "chat" },
      ],
      azure: [
        { id: "gpt-4o-mini", taskType: "chat" },
        { id: "gpt-4o", taskType: "chat" },
      ],
    };

    return NextResponse.json({ success: true, models });
  } catch (e) {
    return Errors.internal(String(e));
  }
}
