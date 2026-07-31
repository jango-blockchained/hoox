/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AnalyticsErrorCode =
  | "MISSING_CREDENTIALS"
  | "QUERY_FAILED"
  | "BAD_REQUEST"
  | "UNKNOWN"
  | "NETWORK"
  | "HTTP";

export interface AnalyticsQueryError {
  message: string;
  code: AnalyticsErrorCode;
}

export interface AnalyticsQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: AnalyticsQueryError | null;
  refetch: () => void;
  /** True after the first successful or failed settle for the current key. */
  settled: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: AnalyticsErrorCode;
}

function friendlyError(
  code: AnalyticsErrorCode | undefined,
  message: string
): AnalyticsQueryError {
  switch (code) {
    case "MISSING_CREDENTIALS":
      return {
        code: "MISSING_CREDENTIALS",
        message:
          "Cloudflare Analytics credentials are not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
      };
    case "QUERY_FAILED":
      return {
        code: "QUERY_FAILED",
        message:
          "Analytics Engine query failed. The dataset may be empty or credentials may lack Analytics Engine SQL access.",
      };
    case "BAD_REQUEST":
      return { code: "BAD_REQUEST", message: message || "Invalid request." };
    default:
      return {
        code: code || "UNKNOWN",
        message: message || "Failed to load analytics data.",
      };
  }
}

/**
 * Client-side fetch helper for /api/analytics/* routes.
 * Handles abort, loading, and structured error codes from the API.
 */
export function useAnalyticsQuery<T>(
  /** Absolute path + query, or null to skip fetching. */
  url: string | null,
  options?: {
    /** Transform raw API data before storing. */
    select?: (data: T) => T;
    /** Re-run key — defaults to url. */
    enabled?: boolean;
  }
): AnalyticsQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<AnalyticsQueryError | null>(null);
  const [settled, setSettled] = useState(false);
  const [tick, setTick] = useState(0);
  const selectRef = useRef(options?.select);
  selectRef.current = options?.select;

  const enabled = options?.enabled !== false;

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!url || !enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url!, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const json = (await res.json()) as ApiEnvelope<T>;

        if (!active) return;

        if (!res.ok || !json.success) {
          setData(null);
          setError(
            friendlyError(
              json.code,
              json.error || `Request failed (${res.status})`
            )
          );
          return;
        }

        const raw = (json.data ?? null) as T | null;
        setData(
          raw != null && selectRef.current ? selectRef.current(raw) : raw
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!active) return;
        setData(null);
        setError({
          code: "NETWORK",
          message:
            err instanceof Error
              ? err.message
              : "Network error while loading analytics.",
        });
      } finally {
        if (active) {
          setLoading(false);
          setSettled(true);
        }
      }
    }

    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [url, enabled, tick]);

  return { data, loading, error, refetch, settled };
}
