/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Health check handler for Cloudflare Workers
 * Provides a standardized /health endpoint response
 */

import { createSuccessResponse } from "./errors";

export interface HealthCheckOptions {
  /** Worker/service name included in the response */
  worker?: string;
  /** Version string included in the response */
  version?: string;
  /** Additional details to include */
  details?: Record<string, unknown>;
}

/**
 * Create a standardized health check response.
 * Returns a JSON response with success status and health metadata.
 * Format: { success: true, result: { status: 'ok', timestamp, worker, version, details } }
 */
export function healthCheck(options?: HealthCheckOptions): Response {
  const result: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  if (options?.worker !== undefined && options?.worker !== null)
    result.service = options.worker;
  if (options?.version !== undefined && options?.version !== null)
    result.version = options.version;
  if (options?.details) result.details = options.details;

  return createSuccessResponse(result);
}
