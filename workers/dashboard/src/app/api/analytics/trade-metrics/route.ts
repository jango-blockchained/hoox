/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { executeAnalyticsQuery } from "@/app/api/analytics/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toAnalyticsTs(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function buildTradeMetricsQuery(start: string, end: string): string {
  return `
    SELECT
      blob3 as exchange,
      count() as trade_count,
      SUM(_sample_interval * double2) / SUM(_sample_interval) as avg_price,
      SUM(if(blob2 = 'success', 1, 0)) as success_count,
      SUM(if(blob2 = 'failure', 1, 0)) as failure_count
    FROM "hoox-analytics"
    WHERE blob1 = 'trade'
      AND timestamp >= toDateTime('${toAnalyticsTs(start)}')
      AND timestamp <= toDateTime('${toAnalyticsTs(end)}')
    GROUP BY blob3
  `.trim();
}

function buildSuccessRateQuery(timeRange?: string): string {
  const timeFilter = timeRange ? `AND timestamp >= '${timeRange}'` : "";
  return `
    SELECT
      count() as total,
      SUM(if(blob2 = 'success', 1, 0)) as successes,
      (SUM(if(blob2 = 'success', 1, 0)) * 100.0 / count()) as success_rate
    FROM "hoox-analytics"
    WHERE blob1 = 'trade'
    ${timeFilter}
  `.trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const start =
      url.searchParams.get("start") ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const end = url.searchParams.get("end") || new Date().toISOString();
    const type = url.searchParams.get("type") || "metrics";

    let sql: string;
    if (type === "success-rate") {
      const timeRange = url.searchParams.get("timeRange") || undefined;
      sql = buildSuccessRateQuery(timeRange);
    } else {
      sql = buildTradeMetricsQuery(start, end);
    }

    const data = await executeAnalyticsQuery(sql);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
