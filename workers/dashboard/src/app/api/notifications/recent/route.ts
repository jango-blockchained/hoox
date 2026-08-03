/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { Errors } from "@hoox-sh/hoox-shared/errors";

// nodejs runtime: dashboard routes consistently use `nodejs` because
// OpenNext's build output omits edge chunk files. See test-coverage.md.
// Middleware already enforces auth (see src/middleware.ts).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const recentAlertSchema = z.object({
  id: z.string().optional(),
  level: z.enum(["info", "warning", "error", "success"]),
  title: z.string(),
  message: z.string(),
  timestamp: z.number().int().nonnegative(),
  source: z.enum(["dashboard-tester", "telegram-worker"]).optional(),
});

const recentResponseSchema = z.object({
  success: z.literal(true),
  alerts: z.array(recentAlertSchema),
  note: z.string().optional(),
  channel: z
    .object({
      status: z.enum(["ok", "stub", "unavailable"]),
      provider: z.literal("telegram"),
    })
    .optional(),
});

/**
 * GET /api/notifications/recent
 *
 * Returns the most recent test notifications dispatched from the dashboard.
 * Today the telegram-worker doesn't expose a history endpoint, so this
 * route returns an empty array and the client falls back to session-local
 * echoes captured during the current browser session.
 *
 * Once the telegram-worker grows a `/recent` (or KV-backed) endpoint,
 * we forward to it here using the same `X-Internal-Auth-Key` pattern
 * as `/api/notifications/send`.
 */
export async function GET() {
  try {
    const payload = recentResponseSchema.parse({
      success: true,
      alerts: [],
      note: "telegram-worker history endpoint not yet available — showing session-local activity only",
      channel: {
        status: "stub",
        provider: "telegram",
      },
    });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("notifications/recent error:", err);
    return Errors.internal(
      err instanceof Error ? err.message : "Failed to load recent notifications"
    );
  }
}
