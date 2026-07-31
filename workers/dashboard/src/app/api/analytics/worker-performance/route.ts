/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ANALYTICS_DATASET,
  analyticsErrorResponse,
  analyticsSuccessResponse,
  AnalyticsApiError,
  buildTimestampFilter,
  executeAnalyticsQuery,
  resolveStartIso,
  sanitizeSqlLiteral,
} from "@/app/api/analytics/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Worker performance from worker-perf data points.
 *
 * Layout: blob1=worker-perf, blob2=worker, blob3=degraded|success
 *         double1=requests, double2=errors, double3=durationMs
 *
 * When `worker` is omitted, returns one row per worker (fleet view).
 */
function buildWorkerPerformanceQuery(
  worker?: string,
  startIso?: string
): string {
  const timeFilter = buildTimestampFilter(startIso);
  const workerFilter = worker
    ? `AND blob2 = '${sanitizeSqlLiteral(worker)}'`
    : "";

  return `
    SELECT
      blob2 as worker,
      blob1 as data_type,
      SUM(double1) as total_requests,
      SUM(double2) as total_errors,
      AVG(double3) as avg_duration_ms
    FROM "${ANALYTICS_DATASET}"
    WHERE blob1 = 'worker-perf'
      ${workerFilter}
      ${timeFilter}
    GROUP BY blob2, blob1
    ORDER BY total_requests DESC
  `.trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workerRaw = url.searchParams.get("worker") || "";
    const worker =
      workerRaw && workerRaw !== "all" ? sanitizeSqlLiteral(workerRaw) : "";
    const startIso = resolveStartIso(url);

    // Empty worker is allowed (fleet overview). Explicit invalid chars become empty.
    if (workerRaw && workerRaw !== "all" && !worker) {
      throw new AnalyticsApiError(
        "Invalid worker parameter",
        "BAD_REQUEST",
        400
      );
    }

    const sql = buildWorkerPerformanceQuery(worker || undefined, startIso);
    const data = await executeAnalyticsQuery(sql);
    return analyticsSuccessResponse(data);
  } catch (err) {
    return analyticsErrorResponse(err);
  }
}
