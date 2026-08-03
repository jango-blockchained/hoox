/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { DashboardEnv } from "@/lib/env";
import { Errors } from "@hoox-sh/hoox-shared/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const env = getCloudflareContext().env as DashboardEnv;

    if (!env.AGENT_SERVICE) {
      return NextResponse.json(
        { error: "Agent service binding not available" },
        { status: 500 }
      );
    }

    const internalKey = env.AGENT_INTERNAL_KEY;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (internalKey) {
      headers["X-Internal-Auth-Key"] = internalKey;
    }

    const res = await env.AGENT_SERVICE.fetch(
      new Request("http://agent-worker.internal/agent/housekeeping", {
        method: "POST",
        headers,
      })
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Agent responded with ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return Errors.internal(String(err));
  }
}
