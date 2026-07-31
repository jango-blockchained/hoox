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
  toAnalyticsTs,
} from "@/app/api/analytics/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trade metrics by exchange for a [start, end] window.
 *
 * Layout: blob1=trade, blob3=success|failure, blob4=exchange
 */
function buildTradeMetricsQuery(start: string, end: string): string {
  return `
    SELECT
      blob4 as exchange,
      count() as trade_count,
      SUM(_sample_interval * double2) / SUM(_sample_interval) as avg_price,
      SUM(if(blob3 = 'success', 1, 0)) as success_count,
      SUM(if(blob3 = 'failure', 1, 0)) as failure_count
    FROM "${ANALYTICS_DATASET}"
    WHERE blob1 = 'trade'
      AND timestamp >= toDateTime('${toAnalyticsTs(start)}')
      AND timestamp <= toDateTime('${toAnalyticsTs(end)}')
    GROUP BY blob4
    ORDER BY trade_count DESC
  `.trim();
}

/**
 * Aggregate success rate. Optional lower-bound via start ISO.
 */
function buildSuccessRateQuery(startIso?: string): string {
  const timeFilter = buildTimestampFilter(startIso);
  return `
    SELECT
      count() as total,
      SUM(if(blob3 = 'success', 1, 0)) as successes,
      SUM(if(blob3 = 'failure', 1, 0)) as failures,
      if(
        count() = 0,
        0,
        SUM(if(blob3 = 'success', 1, 0)) * 100.0 / count()
      ) as success_rate
    FROM "${ANALYTICS_DATASET}"
    WHERE blob1 = 'trade'
    ${timeFilter}
  `.trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const end = url.searchParams.get("end") || new Date().toISOString();
    const type = url.searchParams.get("type") || "metrics";

    let sql: string;
    if (type === "success-rate") {
      const startIso = resolveStartIso(url);
      sql = buildSuccessRateQuery(startIso);
    } else {
      const start =
        resolveStartIso(url) ||
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      sql = buildTradeMetricsQuery(start, end);
    }

    const data = await executeAnalyticsQuery(sql);
    return analyticsSuccessResponse(data);
  } catch (err) {
    return analyticsErrorResponse(err);
  }
}
