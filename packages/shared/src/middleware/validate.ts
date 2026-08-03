/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validation middleware for Cloudflare Workers
 * Uses Zod for runtime schema validation.
 *
 * @available — Available for consumer use. Import from "@hoox-sh/hoox-shared/middleware".
 */

import { z } from "zod";
import type { Result } from "../types";

/**
 * Validate unknown data against a Zod schema, returning a Result type.
 * Provides structured error messages from Zod issue paths.
 */
export function validateJson<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): Result<z.infer<T>> {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      ok: false as const,
      error: result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true as const, value: result.data };
}

/**
 * Legacy signature: parse request body as JSON object.
 * Kept for backward compatibility with existing workers.
 */
export async function validateJsonLegacy(
  request: Request
): Promise<Result<Record<string, unknown>>> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { ok: false, error: "Request body must be a JSON object" };
    }
    return { ok: true, value: body as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Invalid JSON in request body" };
  }
}

export function requireField<T>(
  body: Record<string, unknown>,
  field: string
): Result<T> {
  if (!(field in body)) {
    return { ok: false, error: `Missing required field: ${field}` };
  }
  return { ok: true, value: body[field] as T };
}

export function optionalField<T>(
  body: Record<string, unknown>,
  field: string,
  defaultValue: T
): T {
  if (!(field in body)) return defaultValue;
  return body[field] as T;
}
