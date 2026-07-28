/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error handling utilities for Cloudflare Workers and Dashboard
 * Centralizes error response creation across the monorepo
 */

import type { AppError } from "./types/errors";
export type { AppError };

/**
 * Safely extract an error message from any caught value.
 * Eliminates the duplicated `error instanceof Error ? error.message : String(error)`
 * pattern that appears ~40+ times across the codebase.
 *
 * @example
 * try { ... } catch (err) {
 *   console.error(toError(err));
 * }
 */
export function toError(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as Record<string, unknown>).message === "string"
  ) {
    return (err as Record<string, string>).message;
  }
  // null/undefined should use fallback, not be stringified to "null"/"undefined"
  if (err === null || err === undefined) return fallback;
  try {
    return JSON.stringify(err) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Create a successful JSON response
 */
/**
 * Strip stack traces and potentially sensitive fields from output data
 * before sending to clients. Prevents information exposure.
 */
// Known sensitive field names that require deep sanitization
const SENSITIVE_FIELDS = new Set([
  "password",
  "token",
  "secret",
  "api_key",
  "apiKey",
  "authorization",
]);

/** Check if an object has sensitive fields that need deep sanitization */
function hasSensitiveFields(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_FIELDS.has(key)) return true;
  }
  return false;
}

/** Check if any value in an object is an Error that needs sanitization */
function hasErrorValues(obj: Record<string, unknown>): boolean {
  for (const v of Object.values(obj)) {
    if (v instanceof Error) return true;
  }
  return false;
}

function sanitizeOutput(data: unknown): unknown {
  // Fast path: primitives pass through unchanged
  if (data === null || data === undefined) return data;
  const t = typeof data;
  if (t === "string" || t === "number" || t === "boolean") return data;

  // Error instances: always strip stack/cause (security)
  if (data instanceof Error) {
    return { name: data.name, message: data.message };
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeOutput);
  }

  if (t === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);

    // Small objects (< 10 keys): iterate directly without pre-check overhead.
    // Still recurse to strip Error stack/cause and sensitive fields.
    if (keys.length < 10) {
      const sanitized: Record<string, unknown> = {};
      for (const k of keys) {
        if (k === "stack" || k === "cause") continue;
        const v = obj[k];
        sanitized[k] =
          v instanceof Error
            ? { name: v.name, message: v.message }
            : sanitizeOutput(v);
      }
      return sanitized;
    }

    // Large objects (>= 10 keys): only recurse deeply if the object contains
    // known sensitive fields or Error instances that need sanitization.
    // This avoids O(n) traversal on large payloads that don't contain
    // sensitive data — the common case for most API responses.
    if (!hasSensitiveFields(obj) && !hasErrorValues(obj)) {
      return obj;
    }

    const sanitized: Record<string, unknown> = {};
    for (const k of keys) {
      if (k === "stack" || k === "cause") continue;
      const v = obj[k];
      sanitized[k] =
        v instanceof Error
          ? { name: v.name, message: v.message }
          : sanitizeOutput(v);
    }
    return sanitized;
  }

  return data;
}

export function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(sanitizeOutput(data)), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create a success response with standard format
 */
export function createSuccessResponse(result?: unknown): Response {
  return createJsonResponse({ success: true, result }, 200);
}

/**
 * Create a Cloudflare Worker error response
 * Includes `success: false` in the response body for consistent client-side handling
 */
export function createErrorResponse(
  error: AppError | string,
  status?: number
): Response {
  const message = typeof error === "string" ? error : error.message;
  const statusCode =
    typeof error === "string" ? (status ?? 500) : (error.status ?? 500);

  const body: Record<string, unknown> = { success: false, error: message };
  if (typeof error !== "string" && error.code) body.code = error.code;
  if (typeof error !== "string" && error.details !== undefined)
    body.details = error.details;

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Predefined error factories for common error types
 */
export const Errors = {
  badRequest: (message: string) =>
    createErrorResponse({ message, status: 400, code: "BAD_REQUEST" }),
  unauthorized: (message = "Unauthorized") =>
    createErrorResponse({ message, status: 401, code: "UNAUTHORIZED" }),
  forbidden: (message = "Forbidden") =>
    createErrorResponse({ message, status: 403, code: "FORBIDDEN" }),
  notFound: (message = "Not found") =>
    createErrorResponse({ message, status: 404, code: "NOT_FOUND" }),
  methodNotAllowed: (message = "Method not allowed") =>
    createErrorResponse({ message, status: 405, code: "METHOD_NOT_ALLOWED" }),
  rateLimited: (retryAfter?: number) => {
    const res = createErrorResponse({
      message: "Rate limit exceeded",
      status: 429,
      code: "RATE_LIMITED",
    });
    if (retryAfter) res.headers.set("Retry-After", String(retryAfter));
    return res;
  },
  internal: (err?: unknown) => {
    const message = err
      ? toError(err, "Internal server error")
      : "Internal server error";
    return createErrorResponse({
      message,
      status: 500,
      code: "INTERNAL_ERROR",
    });
  },
};
