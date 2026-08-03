/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves the deployed `hoox` gateway URL.
 *
 * Priority:
 *   1. HOOX_GATEWAY_URL env var (with trailing-slash trim).
 *   2. CLOUDFLARE_ACCOUNT_ID + subdomain_prefix (from root
 *      wrangler.jsonc `global.subdomain_prefix`) + worker name
 *      → https://{name}.{subdomain_prefix}.workers.dev
 *   3. CLOUDFLARE_ACCOUNT_ID + worker name (no subdomain
 *      prefix) → https://{name}.{accountId}.workers.dev
 *
 * Throws if neither env var is available.
 *
 * The subdomain prefix is needed because the root wrangler.jsonc
 * declares `global.subdomain_prefix: "cryptolinx"`, so the
 * actual deployed URL is `https://hoox.cryptolinx.workers.dev`,
 * not `https://hoox.{accountId}.workers.dev`. Without this fix
 * (2026-06-27), the fastpath probe hit a 404 on every request
 * because the URL it was constructed from did not match the
 * deployed URL.
 */

import { readFileSync } from "node:fs";

export interface ResolveOptions {
  workerName?: string; // default "hoox"
}

interface RootWranglerConfig {
  global?: { subdomain_prefix?: string };
}

function readSubdomainPrefix(): string | null {
  // The root wrangler.jsonc is the source of truth for
  // global.subdomain_prefix. Read it once and cache.
  // (Process is short-lived so a no-cache read is fine here.)
  try {
    const raw = readFileSync("wrangler.jsonc", "utf8");
    // Lightweight parse — we only need `global.subdomain_prefix`.
    // Wrangler config is JSONC (JSON-with-comments); strip // and
    // /* */ comments before parsing.
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const parsed: RootWranglerConfig = JSON.parse(stripped);
    const prefix = parsed.global?.subdomain_prefix;
    return typeof prefix === "string" && prefix.length > 0 ? prefix : null;
  } catch {
    return null;
  }
}

export function resolveGatewayUrl(options: ResolveOptions = {}): string {
  const envUrl = process.env.HOOX_GATEWAY_URL;
  if (envUrl && envUrl.length > 0) {
    return envUrl.replace(/\/+$/, "");
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const workerName = options.workerName ?? "hoox";
  if (accountId && accountId.length > 0) {
    const subdomain = readSubdomainPrefix();
    if (subdomain) {
      return `https://${workerName}.${subdomain}.workers.dev`;
    }
    return `https://${workerName}.${accountId}.workers.dev`;
  }

  throw new Error(
    "Cannot resolve hoox gateway URL. Set HOOX_GATEWAY_URL or CLOUDFLARE_ACCOUNT_ID environment variable."
  );
}
