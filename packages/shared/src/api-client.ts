/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * API Client — Bun fetch wrapper with AbortController timeouts, retry logic,
 * and connection-aware error handling for the Hoox TUI dashboard.
 *
 * Auth headers come from the operator transport profile (Bearer + optional
 * Cloudflare Access service-token headers). See `operator-transport.ts`.
 *
 * All fetch calls include a 5s timeout via AbortController.
 * Network errors (fetch failures, timeouts) are retried with exponential backoff.
 * HTTP 401/403 errors are NOT retried — they indicate auth/config issues.
 * HTTP 429 (rate limit) triggers a backing-off warning.
 */

import {
  buildOperatorAuthHeaders,
  operatorUrl,
  resolveOperatorTransportProfile,
  type OperatorTransportEnv,
  type OperatorTransportProfile,
} from "./operator-transport";

/** Default fetch timeout in milliseconds */
const FETCH_TIMEOUT_MS = 5000;

/** Maximum retry attempts for network errors */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY_MS = 1000;

/** Maximum retry delay (ms) */
const MAX_RETRY_DELAY_MS = 16000;

// ─── Error Types ─────────────────────────────────────────────────────────────

export class WorkerAPIError extends Error {
  status: number;
  retryable: boolean;

  constructor(
    message: string,
    options?: { cause?: unknown; status?: number; retryable?: boolean }
  ) {
    super(message, { cause: options?.cause });
    this.name = "WorkerAPIError";
    this.status = options?.status ?? 0;
    this.retryable = options?.retryable ?? false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if an HTTP status indicates a network/transient error worth retrying */
function isRetryableStatus(status: number): boolean {
  // 401/403 = auth issues — don't retry
  // 429 = rate limited — handled separately (not retried automatically)
  if (status === 401 || status === 403 || status === 429) return false;
  // 5xx = server error — retry
  if (status >= 500) return true;
  // 408 request timeout — retry
  if (status === 408) return true;
  return false;
}

/** Check if an error is a network error (not an HTTP response error) */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("dns") ||
      msg.includes("timeout")
    );
  }
  return false;
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function activeProfile(
  override?: OperatorTransportProfile
): OperatorTransportProfile {
  return override ?? resolveOperatorTransportProfile();
}

// ─── Core Fetch ──────────────────────────────────────────────────────────────

export interface HooxFetchOptions extends RequestInit {
  /** Injected transport profile (tests / multi-tenant callers). */
  transport?: OperatorTransportProfile;
  /** Env override when resolving transport (tests). */
  transportEnv?: OperatorTransportEnv;
}

/**
 * Perform an API fetch with timeout, retry logic, and error handling.
 *
 * Retry behavior:
 * - Network errors (connection refused, DNS, timeout): up to MAX_RETRIES,
 *   with exponential backoff: 1s → 2s → 4s → ... capped at 16s.
 * - HTTP 401/403: NO retry — fail immediately.
 * - HTTP 429 (rate limited): NO retry — fail with rate limit info.
 * - HTTP 5xx: retry once.
 *
 * @param path    API path (e.g. "/v1/workers")
 * @param options Fetch options (merged with auth header and timeout signal)
 * @returns       Parsed JSON response body
 */
export async function hooxFetch<T = unknown>(
  path: string,
  options?: HooxFetchOptions
): Promise<T> {
  const profile =
    options?.transport ??
    (options?.transportEnv
      ? resolveOperatorTransportProfile(options.transportEnv)
      : activeProfile());

  const { transport: _t, transportEnv: _e, ...fetchInit } = options ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const url = operatorUrl(profile, path);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...buildOperatorAuthHeaders(profile),
        ...(fetchInit.headers as Record<string, string> | undefined),
      };

      const response = await fetch(url, {
        ...fetchInit,
        headers,
        signal: controller.signal,
      });

      // Rate limited — fail with specific error, no retry
      if (response.status === 429) {
        throw new WorkerAPIError("API rate limited — backing off", {
          status: 429,
          retryable: false,
        });
      }

      // Auth errors — fail immediately, no retry
      if (response.status === 401 || response.status === 403) {
        throw new WorkerAPIError(
          `Authentication failed (HTTP ${response.status})`,
          { status: response.status, retryable: false }
        );
      }

      // Server error — retry if we have attempts left
      if (!response.ok) {
        if (attempt < MAX_RETRIES && isRetryableStatus(response.status)) {
          const delay = Math.min(
            BASE_RETRY_DELAY_MS * Math.pow(2, attempt),
            MAX_RETRY_DELAY_MS
          );
          await sleep(delay);
          continue;
        }
        throw new WorkerAPIError(
          `HTTP ${response.status}: ${response.statusText}`,
          {
            status: response.status,
            retryable: isRetryableStatus(response.status),
          }
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;

      // Don't retry WorkerAPIError with retryable=false
      if (error instanceof WorkerAPIError && !error.retryable) {
        throw error;
      }

      // Retry only on network errors
      if (attempt < MAX_RETRIES && isNetworkError(error)) {
        const delay = Math.min(
          BASE_RETRY_DELAY_MS * Math.pow(2, attempt),
          MAX_RETRY_DELAY_MS
        );
        await sleep(delay);
        continue;
      }

      // Wrap unknown errors
      if (!(error instanceof WorkerAPIError)) {
        throw new WorkerAPIError(
          `Network request failed: ${(error as Error).message}`,
          { cause: error, retryable: false, status: 0 }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Should not be reached, but safety net
  throw new WorkerAPIError("Max retries exhausted", {
    cause: lastError,
    retryable: false,
  });
}
