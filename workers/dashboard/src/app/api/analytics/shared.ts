/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared utilities for analytics API routes.
 * Extracted to eliminate duplicated `executeQuery` across 4 route files.
 */

import { getEnvVar, ENV_KEYS } from "@/lib/config";

/**
 * Shape of a single row returned by the Cloudflare Analytics Engine SQL API.
 * The Analytics Engine returns the rows in the same shape as the SELECT
 * clause, so a generic record is sufficient — the route handlers narrow
 * the type as they hand the result off to the dashboard components.
 */
export type AnalyticsRow = Record<string, unknown>;

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
    throw new Error("Cloudflare credentials not configured");
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
    throw new Error(`Query failed: ${response.status} ${errorText}`);
  }

  const result = (await response.json()) as { data?: AnalyticsRow[] };
  return Array.isArray(result.data) ? result.data : [];
}
