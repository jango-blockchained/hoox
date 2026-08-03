/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error type definitions for centralized error handling
 * Used across all workers and dashboard
 */

export interface AppError {
  message: string;
  status: number;
  code?: string;
  details?: Record<string, unknown>;
}

export type ErrorResponse = {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
};
