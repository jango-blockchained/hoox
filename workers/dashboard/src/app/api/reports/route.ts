/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { Errors } from "@hoox-sh/hoox-shared/errors";

export const dynamic = "force-dynamic";
// OpenNext / Next.js 16 on Cloudflare: route handlers that need
// `getCloudflareContext()` (and therefore access to the report-worker
// service binding once it is wired up) must run on the `nodejs` runtime.
export const runtime = "nodejs";

const reportSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  type: z.enum(["pdf", "csv"]),
});

const reportsResponseSchema = z.object({
  success: z.literal(true),
  reports: z.array(reportSchema),
  meta: z
    .object({
      source: z.enum(["stub", "report-worker", "r2"]),
      note: z.string().optional(),
    })
    .optional(),
});

export type ReportDTO = z.infer<typeof reportSchema>;

/**
 * GET /api/reports
 *
 * Returns the list of reports available in R2 under the `reports/` prefix.
 *
 * The `report-worker` (workers/report-worker) currently exposes only
 * `GET /report` (kick off generation) and a cron trigger — it has no
 * list endpoint yet. To keep the dashboard usable while the upstream is
 * being completed, this handler returns an empty list with `success:
 * true`. The client renders an Empty state until the first real report
 * lands.
 *
 * When the report-worker gains a `GET /reports` list endpoint and the
 * dashboard receives a `REPORT_SERVICE` binding, the body of this
 * function should switch to a `serviceFetch(env.REPORT_SERVICE, ...)`
 * call (see workers/dashboard/src/app/api/housekeeping/route.ts for the
 * canonical proxy pattern). The response shape must continue to match
 * `reportsResponseSchema` so the dashboard's lib/api.ts Zod check passes
 * (extra `meta` is ignored by the client schema via safeParse of the
 * known fields — keep `success` + `reports` stable).
 */
export async function GET() {
  try {
    const payload = {
      success: true as const,
      reports: [] as z.infer<typeof reportSchema>[],
      meta: {
        source: "stub" as const,
        note: "report-worker list endpoint not yet available; returning empty list",
      },
    };
    const parsed = reportsResponseSchema.parse(payload);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("reports list error:", err);
    return Errors.internal(
      err instanceof Error ? err.message : "Failed to list reports"
    );
  }
}
