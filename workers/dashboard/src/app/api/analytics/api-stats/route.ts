/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { executeAnalyticsQuery } from "@/app/api/analytics/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildApiCallStatsQuery(exchange?: string): string {
  const exchangeFilter = exchange ? `AND blob3 = '${exchange}'` : "";
  return `
    SELECT
      blob3 as endpoint,
      count() as call_count,
      AVG(double1) as avg_latency_ms,
      SUM(if(blob2 = 'success', 1, 0)) as success_count
    FROM "hoox-analytics"
    WHERE blob1 = 'api-call'
    ${exchangeFilter}
    GROUP BY blob3
    ORDER BY call_count DESC
  `.trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const exchange = url.searchParams.get("exchange") || undefined;

    const sql = buildApiCallStatsQuery(exchange);
    const data = await executeAnalyticsQuery(sql);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
