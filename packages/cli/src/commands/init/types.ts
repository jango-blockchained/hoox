/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Types for the `hoox init` interactive setup wizard.
 *
 * Re-exports shared integration configs from @hoox-sh/hoox-shared.
 */

/** CLI flags for non-interactive mode. */
export interface InitOptions {
  /** --token: Cloudflare API token (non-interactive mode) */
  token?: string;
  /** --account: Cloudflare account ID (non-interactive mode) */
  account?: string;
  /** --secret-store: Secret Store ID (non-interactive mode) */
  secretStore?: string;
  /** --prefix: Subdomain prefix (non-interactive mode) */
  prefix?: string;
  /** --accept-risk: Skip the risk acknowledgment confirmation */
  acceptRisk?: boolean;
  /** --resume: Resume from saved wizard state */
  resume?: boolean;
  /** --preset: Use a preset worker template (non-interactive) */
  preset?: string;
}
