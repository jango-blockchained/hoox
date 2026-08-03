/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ConfigService types — strongly-typed interfaces for wrangler.jsonc.
 *
 * The shape mirrors the actual wrangler.jsonc at the project root:
 *   global: { cloudflare_api_token, cloudflare_account_id, cloudflare_secret_store_id, subdomain_prefix }
 *   workers: { name: { enabled, path, vars?, secrets? } }
 */

/**
 * A secret referenced by a worker. Each entry is the Cloudflare secret
 * name that the worker expects at runtime.
 */
export type WorkerSecret = string;

/**
 * Environment variables bound to a worker at deploy time.
 */
export interface WorkerVars {
  [key: string]: string;
}

/**
 * Per-worker configuration as defined in wrangler.jsonc.
 */
export interface WorkerConfig {
  /** Whether the worker is deployed and managed by the CLI. */
  enabled: boolean;
  /** Relative path from project root to the worker directory. */
  path: string;
  /** Plain-text environment variables (non-secret build-time vars). */
  vars?: WorkerVars;
  /** Cloudflare secret names this worker needs at runtime. */
  secrets?: WorkerSecret[];
}

/**
 * Development configuration for local runtime selection.
 */
export interface DevConfig {
  /** Preferred runtime: "native" (wrangler dev) or "docker" (compose). */
  runtime?: "native" | "docker";
}

/**
 * Global configuration shared across all workers in the project.
 */
export interface GlobalConfig {
  /** Cloudflare API token for authenticated operations. */
  cloudflare_api_token?: string;
  /** Cloudflare account ID (required — must be set before deploy). */
  cloudflare_account_id?: string;
  /** Secret Store ID for centralized secret management. */
  cloudflare_secret_store_id?: string;
  /** Subdomain prefix used for worker URL routing. */
  subdomain_prefix?: string;
}

/**
 * Top-level Hoox configuration — the root shape of wrangler.jsonc.
 */
export interface HooxConfig {
  global: GlobalConfig;
  workers: Record<string, WorkerConfig>;
  /** Development settings (runtime preference, etc.). */
  dev?: DevConfig;
}
