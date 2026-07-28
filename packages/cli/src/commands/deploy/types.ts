/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deploy command types — options and result interfaces for the deploy
 * command group (all, workers, worker, dashboard).
 */

/**
 * Options for a single worker deployment.
 */
export interface DeployOptions {
  /** Cloudflare environment (e.g. "production", "staging"). */
  env?: string;
}

/**
 * Result of deploying a single worker.
 */
export interface DeployResult {
  /** Worker name as defined in wrangler.jsonc. */
  worker: string;
  /** Deployed URL extracted from wrangler output, if available. */
  url?: string;
  /** Whether the deployment succeeded. */
  success: boolean;
  /** Error message when success is false. */
  error?: string;
  /** Bundle size (e.g., "7102.32 KiB") */
  size?: string;
  /** Worker startup time (e.g., "37 ms") */
  startupTime?: string;
  /** Version ID */
  versionId?: string;
  /** Raw wrangler output (first non-empty line, for debugging) */
  rawOutput?: string;
}
