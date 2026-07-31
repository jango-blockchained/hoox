/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared utilities for analytics API routes.
 *
 * Analytics Engine blob layout (from analytics-worker helpers):
 *   trade:       blob1=trade, blob2=worker, blob3=success|failure, blob4=exchange, blob5=symbol
 *                double1=qty, double2=price, double3=latencyMs
 *   api-call:    blob1=api-call, blob2=worker, blob3=success|failure, blob4=endpoint
 *                double1=latencyMs
 *   worker-perf: blob1=worker-perf, blob2=worker, blob3=degraded|success
 *                double1=requests, double2=errors, double3=durationMs
 *   signal:      blob1=signal, blob2=source, blob3=status, blob4=type, blob5=symbol
 *                double1=confidence
 */

import { NextResponse } from "next/server";
import { getEnvVar, ENV_KEYS } from "@/lib/config";

/**
 * Shape of a single row returned by the Cloudflare Analytics Engine SQL API.
 * The Analytics Engine returns the rows in the same shape as the SELECT
 * clause, so a generic record is sufficient — the route handlers narrow
 * the type as they hand the result off to the dashboard components.
 */
export type AnalyticsRow = Record<string, unknown>;

/** Dataset name bound in analytics-worker wrangler config. */
export const ANALYTICS_DATASET = "hoox-analytics";

/**
 * Convert an ISO-8601 timestamp to the format Analytics Engine SQL expects
 * inside toDateTime('…'): `YYYY-MM-DD HH:MM:SS` (no T, no millis, no Z).
 */
export function toAnalyticsTs(iso: string): string {
  return iso
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "")
    .replace(/Z$/, "")
    .replace(/\.\d+$/, "");
}

/**
 * Build a SQL AND-clause filtering timestamp >= startIso.
 * Returns empty string when startIso is missing / empty.
 */
export function buildTimestampFilter(startIso?: string | null): string {
  if (!startIso) return "";
  try {
    // Validate parseable date before interpolating.
    const d = new Date(startIso);
    if (Number.isNaN(d.getTime())) return "";
    return `AND timestamp >= toDateTime('${toAnalyticsTs(d.toISOString())}')`;
  } catch {
    return "";
  }
}

/**
 * Resolve a start ISO timestamp from common query params:
 * - `start` (ISO)
 * - `timeRange` (ISO lower bound, legacy)
 * - `days` (number of days lookback)
 */
export function resolveStartIso(url: URL): string | undefined {
  const start = url.searchParams.get("start");
  if (start) return start;

  const timeRange = url.searchParams.get("timeRange");
  if (timeRange) return timeRange;

  const daysRaw = url.searchParams.get("days");
  if (daysRaw) {
    const days = Number(daysRaw);
    if (Number.isFinite(days) && days > 0) {
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return undefined;
}

/**
 * Sanitize a free-text SQL string literal (worker name, endpoint, etc.).
 * Only allow alphanumeric, dash, underscore, slash, colon, dot.
 */
export function sanitizeSqlLiteral(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-/:.]/g, "");
}

/**
 * Execute a SQL query against Cloudflare Analytics Engine and return
 * just the rows array.
 *
 * The Cloudflare API returns a wrapper of the form:
 *   { meta: [...], data: [...], rows: N, rows_before_limit_at_least: N, duration_ms: N }
 *
 * Callers (the 4 analytics route handlers) and their downstream components
 * all expect an array of rows, so we extract `data` here. Returning the
 * wrapper instead caused a production incident on the /dashboard/analytics
 * page: components called `.map()` on the wrapper object and recharts
 * internally called `.slice()`, both of which threw
 * "r.slice is not a function" / "data.map is not a function".
 *
 * @returns The `data` array from the Analytics Engine response
 * @throws If credentials are missing or the query fails
 */
export async function executeAnalyticsQuery(
  sql: string
): Promise<AnalyticsRow[]> {
  const accountId = getEnvVar(ENV_KEYS.cloudflare.accountId) || "";
  const apiToken = getEnvVar(ENV_KEYS.cloudflare.apiToken) || "";

  if (!accountId || !apiToken) {
    throw new AnalyticsApiError(
      "Cloudflare credentials not configured",
      "MISSING_CREDENTIALS",
      503
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: sql,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new AnalyticsApiError(
      `Query failed: ${response.status} ${errorText}`,
      "QUERY_FAILED",
      502
    );
  }

  const result = (await response.json()) as { data?: AnalyticsRow[] };
  return Array.isArray(result.data) ? result.data : [];
}

export type AnalyticsErrorCode =
  | "MISSING_CREDENTIALS"
  | "QUERY_FAILED"
  | "BAD_REQUEST"
  | "UNKNOWN";

export class AnalyticsApiError extends Error {
  code: AnalyticsErrorCode;
  status: number;

  constructor(
    message: string,
    code: AnalyticsErrorCode = "UNKNOWN",
    status = 500
  ) {
    super(message);
    this.name = "AnalyticsApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Consistent JSON error envelope for analytics routes.
 * Surfaces a stable `code` so the UI can show operator-friendly copy.
 */
export function analyticsErrorResponse(err: unknown): NextResponse {
  if (err instanceof AnalyticsApiError) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        code: err.code,
      },
      { status: err.status }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      code: "UNKNOWN" as AnalyticsErrorCode,
    },
    { status: 500 }
  );
}

export function analyticsSuccessResponse(data: AnalyticsRow[]): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    meta: { count: data.length },
  });
}
