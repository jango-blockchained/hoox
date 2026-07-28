/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Analytics tracking utilities for Cloudflare Workers
 * Centralizes the trackAnalytics helper used across all workers
 */

/**
 * Environment with optional analytics service binding.
 * Workers that support analytics tracking should extend this type.
 *
 * Note on auth: `trackAnalytics` reads `INTERNAL_KEY_BINDING` from the
 * passed env to authenticate with the analytics worker (its `/track/*`
 * routes are gated by `requireInternalAuth`). We don't declare the
 * property here because Cloudflare's generated `Env` type already
 * includes it as a required string, and declaring it again as
 * `INTERNAL_KEY_BINDING?: string` would conflict with workers that
 * `extends Cloudflare.Env, AnalyticsEnv` (TS2320). The property is
 * accessed dynamically; production envs from wrangler always have it,
 * and test mocks add it explicitly via spread.
 */
export interface AnalyticsEnv {
  ANALYTICS_SERVICE?: Fetcher;
}

/**
 * Optional configuration for trackAnalytics.
 */
export interface TrackAnalyticsOptions {
  /**
   * Custom indexes to attach to the Analytics Engine data point.
   * Use this to tag rows with stable identifiers (e.g. probe_id)
   * so they can be SQL-queried later.
   */
  indexes?: readonly string[];
}

/**
 * Track an analytics event by forwarding to the analytics worker.
 * Non-blocking: failures are logged but never throw.
 *
 * @param env - Worker environment with optional ANALYTICS_SERVICE binding
 * @param endpoint - Analytics endpoint path (e.g., "/track/api-call")
 * @param body - JSON-serializable payload to send
 * @param options - Optional config (currently supports `indexes`)
 */
export async function trackAnalytics(
  env: AnalyticsEnv,
  endpoint: string,
  body: Record<string, unknown>,
  options?: TrackAnalyticsOptions
): Promise<void> {
  if (!env.ANALYTICS_SERVICE) return;
  try {
    const payload = {
      ...body,
      ...(options?.indexes ? { indexes: [...options.indexes] } : {}),
    };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // `INTERNAL_KEY_BINDING` is declared on Cloudflare's generated
    // `Env` type, not on `AnalyticsEnv` (to avoid duplicate-property
    // conflicts in workers whose `Env` extends both). Read it
    // dynamically; the property is always present at runtime in
    // production, and test mocks add it explicitly.
    const internalKey = (env as { INTERNAL_KEY_BINDING?: string })
      .INTERNAL_KEY_BINDING;
    if (internalKey) {
      headers["X-Internal-Auth-Key"] = internalKey;
    }
    await env.ANALYTICS_SERVICE.fetch(
      new Request(`http://localhost${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })
    );
  } catch (e) {
    console.error("Analytics tracking failed:", e);
  }
}
