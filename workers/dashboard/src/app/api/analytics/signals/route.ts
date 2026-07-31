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
} from "@/app/api/analytics/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Signal outcomes by source / type / symbol.
 *
 * Layout: blob1=signal, blob2=source, blob3=status, blob4=type, blob5=symbol
 *         double1=confidence
 */
function buildSignalOutcomesQuery(startIso?: string): string {
  const timeFilter = buildTimestampFilter(startIso);
  return `
    SELECT
      blob2 as source,
      blob4 as signal_type,
      blob5 as symbol,
      count() as signal_count,
      AVG(double1) as avg_confidence
    FROM "${ANALYTICS_DATASET}"
    WHERE blob1 = 'signal'
    ${timeFilter}
    GROUP BY blob2, blob4, blob5
    ORDER BY signal_count DESC
    LIMIT 100
  `.trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const startIso = resolveStartIso(url);

    const sql = buildSignalOutcomesQuery(startIso);
    const data = await executeAnalyticsQuery(sql);
    return analyticsSuccessResponse(data);
  } catch (err) {
    return analyticsErrorResponse(err);
  }
}
