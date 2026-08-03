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

export async function GET(_request: NextRequest) {
  try {
    const env = getCloudflareContext().env as DashboardEnv & { AI?: Ai };

    const providers = [
      { name: "workers-ai", available: !!env.AI },
      { name: "openai", available: true },
      { name: "anthropic", available: true },
      { name: "google", available: true },
      { name: "azure", available: true },
    ];

    const results: Record<
      string,
      { healthy: boolean; latency?: number; error?: string }
    > = {};

    for (const provider of providers) {
      if (!provider.available) {
        results[provider.name] = {
          healthy: false,
          error: "Provider not configured",
        };
        continue;
      }

      const start = Date.now();
      try {
        if (provider.name === "workers-ai" && env.AI) {
          await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          });
        }
        results[provider.name] = { healthy: true, latency: Date.now() - start };
      } catch (e) {
        results[provider.name] = {
          healthy: false,
          latency: Date.now() - start,
          error: String(e),
        };
      }
    }

    return NextResponse.json({ success: true, providers: results });
  } catch (e) {
    return Errors.internal(String(e));
  }
}
