/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SecretsService types — secret management for Cloudflare Workers.
 */

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

import type { Result } from "@hoox-sh/hoox-shared";

// Re-export the shared Result<T> for convenience
export type { Result };

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface SecretStatus {
  /** Name of the secret (e.g. "TG_BOT_TOKEN_BINDING"). */
  name: string;
  /** Whether the secret has a real (non-placeholder) value set. */
  set: boolean;
  /** Where the value was found ("workers/<name>/.dev.vars" or undefined). */
  source?: string;
}

export interface SecretCheckResult {
  /** Worker name as it appears in wrangler.jsonc. */
  worker: string;
  /** Per-secret status entries. */
  secrets: SecretStatus[];
  /** True when *every* required secret is present with a real value. */
  allSet: boolean;
  /** Secret names that are either missing or still placeholder. */
  missing: string[];
}

/** Options for {@link SecretsService.syncToCloudflare}. */
export interface SyncSecretsOptions {
  /**
   * When true, only sync system/mesh secrets (internal auth keys, webhook,
   * session). Skips exchange keys, bot tokens, and other integration secrets.
   * CLI: `--system` / `--required`.
   */
  systemOnly?: boolean;
}

/** Per-secret outcome from a sync attempt. */
export type SecretSyncStatus = "synced" | "skipped" | "failed";

export interface SecretSyncItem {
  name: string;
  status: SecretSyncStatus;
  /** Human reason for skip/fail (placeholder, missing, wrangler error, …). */
  reason?: string;
}

/**
 * Result of syncing one worker. `ok` is true when nothing **failed**
 * (skips for non-system secrets under `--system` still count as ok).
 * Partial success is represented by `synced.length > 0` with `failed` empty
 * or with both arrays non-empty when some put operations failed.
 */
export interface SecretSyncResult {
  worker: string;
  ok: boolean;
  synced: string[];
  skipped: SecretSyncItem[];
  failed: SecretSyncItem[];
  /** Flat list of all items (synced/skipped/failed) for tables. */
  items: SecretSyncItem[];
}

// ---------------------------------------------------------------------------
// Internal config shape (subset of wrangler.jsonc used by SecretsService)
// ---------------------------------------------------------------------------

export interface WorkerSecretConfig {
  enabled: boolean;
  path: string;
  secrets?: string[];
}

export interface WorkersJsonc {
  workers: Record<string, WorkerSecretConfig>;
}
