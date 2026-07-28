/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { executeAnalyticsQuery } from "@/app/api/analytics/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildWorkerPerformanceQuery(
  worker: string,
  timeRange?: string
): string {
  const timeFilter = timeRange ? `AND timestamp >= '${timeRange}'` : "";
  return `
    SELECT
      blob1 as data_type,
      SUM(double1) as total_requests,
      SUM(double2) as total_errors,
      AVG(double3) as avg_duration_ms
    FROM "hoox-analytics"
    WHERE blob1 IN ('worker-perf', 'api-call')
      AND blob2 = '${worker}'
      ${timeFilter}
    GROUP BY blob1
  `.trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const worker = url.searchParams.get("worker") || "";
    const timeRange = url.searchParams.get("timeRange") || undefined;

    if (!worker) {
      return NextResponse.json(
        { success: false, error: "Worker parameter is required" },
        { status: 400 }
      );
    }

    const sql = buildWorkerPerformanceQuery(worker, timeRange);
    const data = await executeAnalyticsQuery(sql);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
