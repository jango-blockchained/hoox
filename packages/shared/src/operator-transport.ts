/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Operator transport profile — how CLI/TUI clients reach the management plane.
 *
 * Transports:
 *   public  — HTTPS + optional Bearer (default)
 *   access  — Cloudflare Access service-token headers (+ optional Bearer)
 *   mtls    — reserved (Enterprise); headers same as public until TLS certs land
 *   tunnel  — reserved (private hostname); headers same as public
 *
 * Client maps HOOX_API_TOKEN → Authorization: Bearer …
 * Server maps OPERATOR_API_KEY (preferred) or INTERNAL_API_KEY → requireOperatorAuth
 */

export type OperatorTransport = "public" | "access" | "mtls" | "tunnel";

export interface OperatorTransportProfile {
  transport: OperatorTransport;
  /** API base URL without trailing slash */
  apiBase: string;
  /** Bearer token (HOOX_API_TOKEN); empty if unset */
  bearerToken: string;
  /** CF Access service token client id */
  accessClientId: string;
  /** CF Access service token client secret */
  accessClientSecret: string;
}

export interface OperatorTransportEnv {
  HOOX_API_URL?: string;
  HOOX_API_TOKEN?: string;
  HOOX_TRANSPORT?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  [key: string]: string | undefined;
}

const DEFAULT_API_BASE = "http://localhost:8787";

const VALID_TRANSPORTS = new Set<OperatorTransport>([
  "public",
  "access",
  "mtls",
  "tunnel",
]);

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseTransport(raw: string | undefined): OperatorTransport | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (VALID_TRANSPORTS.has(v as OperatorTransport)) {
    return v as OperatorTransport;
  }
  return null;
}

export interface ResolveOperatorTransportOptions {
  /**
   * Fallback transport when HOOX_TRANSPORT is unset
   * (e.g. from ~/.hoox/config.json).
   */
  configTransport?: string;
  /** Fallback API base when HOOX_API_URL is unset. */
  configApiUrl?: string;
  /** Fallback bearer when HOOX_API_TOKEN is unset. */
  configApiToken?: string;
}

/**
 * Resolve operator transport from env (process.env by default).
 * Pure + injectable for tests. Optional config fallbacks for file-backed prefs.
 */
export function resolveOperatorTransportProfile(
  env: OperatorTransportEnv = process.env as OperatorTransportEnv,
  options: ResolveOperatorTransportOptions = {}
): OperatorTransportProfile {
  const accessClientId = env.CF_ACCESS_CLIENT_ID?.trim() ?? "";
  const accessClientSecret = env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "";
  const hasAccess = Boolean(accessClientId && accessClientSecret);

  const explicit =
    parseTransport(env.HOOX_TRANSPORT) ??
    parseTransport(options.configTransport);
  const transport: OperatorTransport =
    explicit ?? (hasAccess ? "access" : "public");

  const apiFromEnv = env.HOOX_API_URL?.trim();
  const apiFromConfig = options.configApiUrl?.trim();
  const tokenFromEnv = env.HOOX_API_TOKEN?.trim();
  const tokenFromConfig = options.configApiToken?.trim();

  return {
    transport,
    apiBase: stripTrailingSlashes(
      apiFromEnv || apiFromConfig || DEFAULT_API_BASE
    ),
    bearerToken: tokenFromEnv || tokenFromConfig || "",
    accessClientId,
    accessClientSecret,
  };
}

/**
 * Build HTTP headers for operator management requests.
 * Never logs secrets; callers must not print the result in debug without redaction.
 */
export function buildOperatorAuthHeaders(
  profile: OperatorTransportProfile
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (profile.bearerToken) {
    headers.Authorization = `Bearer ${profile.bearerToken}`;
  }

  // Access service tokens work on Access-protected hostnames for any transport
  // that still uses public HTTP(S) (access, tunnel hostname, public+Access).
  const useAccessHeaders =
    profile.transport === "access" ||
    (Boolean(profile.accessClientId) && Boolean(profile.accessClientSecret));

  if (
    useAccessHeaders &&
    profile.accessClientId &&
    profile.accessClientSecret
  ) {
    headers["CF-Access-Client-Id"] = profile.accessClientId;
    headers["CF-Access-Client-Secret"] = profile.accessClientSecret;
  }

  return headers;
}

/** True when the profile has any client-side operator credential. */
export function hasOperatorClientCredentials(
  profile: OperatorTransportProfile
): boolean {
  if (profile.bearerToken) return true;
  return Boolean(profile.accessClientId && profile.accessClientSecret);
}

/**
 * Join base URL and path without double slashes.
 * Paths should start with `/`.
 */
export function operatorUrl(
  profile: OperatorTransportProfile,
  path: string
): string {
  const base = profile.apiBase.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
