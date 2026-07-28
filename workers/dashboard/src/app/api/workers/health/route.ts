/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import type { DashboardEnv } from "@/lib/env";
import { DEFAULT_WORKER_LIST } from "@/lib/settings/workers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HealthResponseSchema = z.object({
  workers: z.record(
    z.string(),
    z.object({
      kvReachable: z.boolean(),
      lastChecked: z.number(),
      prefixUsed: z.string().optional(),
      error: z.string().optional(),
    })
  ),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * GET /api/workers/health
 *
 * Returns per-worker CONFIG_KV reachability. The dashboard uses this to
 * surface a colored health dot per worker in the "Connected Workers"
 * card on the settings page. If `CONFIG_KV` is not bound to the dashboard
 * (e.g. local dev with D1 fallback), every worker is reported as
 * "unknown" rather than "unreachable" so we don't raise false alarms.
 *
 * The check is intentionally lightweight: a single KV.list() per worker
 * with their default prefix. We don't read values, so the call is fast
 * and the result is purely structural.
 */
export async function GET(
  _request: NextRequest,
  _context: { params: Promise<Record<string, unknown>> }
) {
  const lastChecked = Date.now();
  const env = getCloudflareContext().env as DashboardEnv;

  if (!env.CONFIG_KV) {
    return NextResponse.json({
      workers: Object.fromEntries(
        DEFAULT_WORKER_LIST.map((w) => [
          w.name,
          {
            kvReachable: false,
            lastChecked,
            error: "CONFIG_KV not bound to dashboard",
          },
        ])
      ),
    });
  }

  // For each worker, try to list at least one key under a prefix that
  // the worker would own. If KV.list throws or the env binding is
  // missing, the worker is reported as unreachable.
  const checks = await Promise.allSettled(
    DEFAULT_WORKER_LIST.map(async (w) => {
      const prefix = w.defaultPrefix;
      try {
        await env.CONFIG_KV.list({ prefix, limit: 1 });
        return [
          w.name,
          { kvReachable: true, lastChecked, prefixUsed: prefix },
        ] as const;
      } catch (err) {
        return [
          w.name,
          {
            kvReachable: false,
            lastChecked,
            prefixUsed: prefix,
            error: (err as Error).message,
          },
        ] as const;
      }
    })
  );

  const workers: HealthResponse["workers"] = {};
  for (const result of checks) {
    if (result.status === "fulfilled") {
      const [name, status] = result.value;
      workers[name] = status;
    } else {
      // Promise.allSettled shouldn't reject here (we catch per-worker),
      // but be defensive.
    }
  }

  // Run the response through the schema for runtime validation. This
  // guards against future drift between the declared type and the
  // actual object built above (e.g. if a new worker field is added).
  const response = HealthResponseSchema.parse({ workers });
  return NextResponse.json(response);
}
