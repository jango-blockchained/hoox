/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ANALYTICS_DATASET,
  analyticsErrorResponse,
  analyticsSuccessResponse,
  buildTimestampFilter,
  executeAnalyticsQuery,
  resolveStartIso,
  sanitizeSqlLiteral,
} from "@/app/api/analytics/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * API call statistics.
 *
 * Layout: blob1=api-call, blob2=worker, blob3=success|failure, blob4=endpoint
 *         double1=latencyMs
 *
 * Optional filters: worker (preferred), exchange (legacy alias → worker).
 */
function buildApiCallStatsQuery(worker?: string, startIso?: string): string {
  const timeFilter = buildTimestampFilter(startIso);
  const workerFilter = worker
    ? `AND blob2 = '${sanitizeSqlLiteral(worker)}'`
    : "";

  return `
    SELECT
      blob4 as endpoint,
      blob2 as worker,
      count() as call_count,
      AVG(double1) as avg_latency_ms,
      SUM(if(blob3 = 'success', 1, 0)) as success_count
    FROM "${ANALYTICS_DATASET}"
    WHERE blob1 = 'api-call'
      ${workerFilter}
      ${timeFilter}
    GROUP BY blob4, blob2
    ORDER BY call_count DESC
    LIMIT 50
  `.trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // Prefer `worker`; accept legacy `exchange` as a misnamed worker filter.
    const worker =
      url.searchParams.get("worker") ||
      url.searchParams.get("exchange") ||
      undefined;
    const startIso = resolveStartIso(url);

    const sql = buildApiCallStatsQuery(
      worker && worker !== "all" ? worker : undefined,
      startIso
    );
    const data = await executeAnalyticsQuery(sql);
    return analyticsSuccessResponse(data);
  } catch (err) {
    return analyticsErrorResponse(err);
  }
}
