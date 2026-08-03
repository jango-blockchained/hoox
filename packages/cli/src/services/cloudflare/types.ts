/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Result } from "@hoox-sh/hoox-shared";

/**
 * WranglerResult<T> — alias for the shared Result<T> type, used for all
 * wrangler CLI operations. Pattern: never throws; callers match on `ok`
 * to handle success/error.
 */
export type WranglerResult<T> = Result<T>;

/** Result of a wrangler deploy operation. */
export interface DeployResult {
  /** The deployed worker URL extracted from wrangler stdout. */
  url?: string;
  /** Worker name */
  name?: string;
  /** Uploaded bundle size (e.g., "7102.32 KiB") */
  size?: string;
  /** Worker startup time (e.g., "37 ms") */
  startupTime?: string;
  /** Version ID */
  versionId?: string;
  /** Raw deploy output for verbose display */
  rawOutput?: string;
}

/** Result of a wrangler dev operation. */
export interface DevResult {
  /** The local dev server port. */
  port: number;
}

/** A single version entry from `wrangler versions list`. */
export interface VersionEntry {
  /** Unique version ID (UUID). */
  id: string;
  /** Sequential version number. */
  number?: number;
  /** ISO-8601 creation timestamp. */
  created_on?: string;
  /** Author email / identity. */
  author?: string;
  /** Optional user-provided message. */
  message?: string;
  /** Source of the version (upload, rollback, etc.). */
  source?: string;
}
