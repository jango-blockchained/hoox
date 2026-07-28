/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";

// nodejs runtime: dashboard routes consistently use `nodejs` because
// OpenNext's build output omits edge chunk files. See test-coverage.md.
// Middleware already enforces auth (see src/middleware.ts).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/notifications/recent
 *
 * Returns the most recent test notifications dispatched from the dashboard.
 * Today the telegram-worker doesn't expose a history endpoint, so this
 * route returns an empty array and the client falls back to locally-echoed
 * entries captured during the current session.
 *
 * Once the telegram-worker grows a `/recent` (or KV-backed) endpoint,
 * we forward to it here using the same `X-Internal-Auth-Key` pattern
 * as `/api/notifications/send`.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    alerts: [],
    note: "telegram-worker history endpoint not yet available",
  });
}
