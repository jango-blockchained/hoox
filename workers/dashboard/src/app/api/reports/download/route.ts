/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Errors } from "@hoox-sh/hoox-shared/errors";

export const dynamic = "force-dynamic";
// Must run on `nodejs` for OpenNext to expose Cloudflare bindings; see
// the comment in `workers/dashboard/src/app/api/reports/route.ts`.
export const runtime = "nodejs";

const keyQuerySchema = z.object({
  key: z
    .string()
    .min(1, "Missing 'key' query parameter")
    .max(512, "Report key is too long (max 512 characters)")
    // R2 keys are restricted to a single segment under the `reports/`
    // prefix; this regex blocks traversal, double-encoded slashes, and
    // any non-s3-safe character before the value ever reaches a fetch.
    .regex(
      /^reports\/[A-Za-z0-9._-]+$/,
      "Invalid report key — expected reports/<filename> with safe characters only"
    ),
});

/**
 * GET /api/reports/download?key=...
 *
 * Streams a single report PDF/CSV from R2 by way of the report-worker.
 *
 * Today the dashboard does not yet have a `REPORT_SERVICE` service
 * binding in wrangler.jsonc, and the report-worker does not yet expose
 * a `GET /report/:key` endpoint that reads from R2. Until both halves
 * land, the route is a proper handler: it validates the `key` with Zod
 * (fail-closed on missing / malformed input) and returns a clear 503
 * with the offending key so the client can surface a useful toast
 * instead of a generic failure.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const rawKey = url.searchParams.get("key");
    if (rawKey === null) {
      return Errors.badRequest(
        "Missing required query parameter 'key'. Example: /api/reports/download?key=reports/portfolio-2026-01-01.pdf"
      );
    }

    const result = keyQuerySchema.safeParse({ key: rawKey });
    if (!result.success) {
      return Errors.badRequest(
        result.error.issues[0]?.message ?? "Invalid 'key' query parameter"
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "Report download is not yet wired up. The report-worker download endpoint (R2 stream) is being implemented. Retry after the REPORT_SERVICE binding is configured.",
        code: "REPORT_DOWNLOAD_UNAVAILABLE",
        key: result.data.key,
      },
      { status: 503 }
    );
  } catch (err) {
    console.error("reports/download error:", err);
    return Errors.internal(
      err instanceof Error ? err.message : "Failed to download report"
    );
  }
}
