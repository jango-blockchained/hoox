/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TUI connection helpers — LOCAL/REMOTE mode, auth presence, and error
 * classification used by the status bar, connection toasts, and startup.
 *
 * Pure functions (env-read wrappers included) so unit tests don't need a
 * renderer. Never log raw tokens.
 */

import {
  resolveOperatorTransportProfile,
  type OperatorTransport,
  type OperatorTransportEnv,
} from "@hoox-sh/hoox-shared";

export type TuiMode = "local" | "remote";

export type ConnectionErrorKind = "auth" | "rate-limit" | "network" | "unknown";

export interface TuiConnectionEnv {
  mode: TuiMode;
  apiUrl: string;
  apiHost: string;
  hasToken: boolean;
  /** True when CLI fallback is appropriate (local only). */
  allowCliFallback: boolean;
}

const DEFAULT_API_URL = "http://localhost:8787";

/** Read `HOOX_TUI_MODE` (defaults to local). */
export function getTuiMode(env: NodeJS.ProcessEnv = process.env): TuiMode {
  return env.HOOX_TUI_MODE === "remote" ? "remote" : "local";
}

/** Resolved API base URL (no trailing slash). */
export function getApiBase(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.HOOX_API_URL?.trim() || DEFAULT_API_URL;
  return raw.replace(/\/+$/, "");
}

/** Host label for status bar / toasts. */
export function getApiHost(apiUrl: string = getApiBase()): string {
  try {
    return new URL(apiUrl).host || apiUrl;
  } catch {
    return apiUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") || apiUrl;
  }
}

/** Whether a non-empty API bearer token is configured. */
export function hasApiToken(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.HOOX_API_TOKEN?.trim());
}

/**
 * Remote HTTP is the source of truth — local CLI `check health` must not
 * mark a remote session as connected when the gateway is down.
 */
export function shouldUseCliFallback(mode: TuiMode): boolean {
  return mode === "local";
}

/** Snapshot of mode/auth/url for startup and toasts. */
export function resolveTuiConnectionEnv(
  env: NodeJS.ProcessEnv = process.env
): TuiConnectionEnv {
  const mode = getTuiMode(env);
  const apiUrl = getApiBase(env);
  return {
    mode,
    apiUrl,
    apiHost: getApiHost(apiUrl),
    hasToken: hasApiToken(env),
    allowCliFallback: shouldUseCliFallback(mode),
  };
}

/**
 * Classify a connection error message (from WorkerAPIError / fetch).
 * Used for auth-specific UX and toast routing.
 */
export function classifyConnectionError(
  message: string | null | undefined
): ConnectionErrorKind {
  if (!message) return "unknown";
  const m = message.toLowerCase();
  if (
    m.includes("authentication failed") ||
    m.includes("http 401") ||
    m.includes("http 403") ||
    m.includes("unauthorized") ||
    m.includes("forbidden")
  ) {
    return "auth";
  }
  if (
    m.includes("rate limited") ||
    m.includes("http 429") ||
    m.includes("429")
  ) {
    return "rate-limit";
  }
  if (
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("abort") ||
    m.includes("fetch failed") ||
    m.includes("connection")
  ) {
    return "network";
  }
  return "unknown";
}

/**
 * Human-readable auth status for CLI launch banner (never includes the token).
 */
export function formatAuthBanner(hasToken: boolean, mode: TuiMode): string {
  if (hasToken) return "set (Bearer HOOX_API_TOKEN)";
  if (mode === "remote") {
    return "missing — remote gateway may reject requests (set HOOX_API_TOKEN)";
  }
  return "not set (optional for local wrangler dev)";
}

/** Safe one-line hint when remote auth is missing. */
export function remoteAuthMissingHint(): string {
  return "Set HOOX_API_TOKEN (or pass --token) for authenticated remote API access.";
}

/** Read-only connection snapshot for Settings (never includes secrets). */
export interface SettingsConnectionSnapshot {
  mode: TuiMode;
  apiHost: string;
  transport: OperatorTransport;
  /** Human auth presence: none | Bearer | Access | Bearer + Access */
  authSummary: string;
  /** CLI hint for changing transport / probing security */
  hint: string;
}

export interface SettingsConnectionConfigFallback {
  transport?: string;
  apiUrl?: string;
  apiToken?: string;
}

/**
 * Build a Settings-friendly connection line from env (+ optional config.json).
 * Env always wins over config for URL/token/transport (mirrors operator profile).
 */
export function getSettingsConnectionSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  config: SettingsConnectionConfigFallback = {}
): SettingsConnectionSnapshot {
  const conn = resolveTuiConnectionEnv(env);
  const profile = resolveOperatorTransportProfile(env as OperatorTransportEnv, {
    configTransport: config.transport,
    configApiUrl: config.apiUrl,
    configApiToken: config.apiToken,
  });

  const hasBearer = Boolean(profile.bearerToken);
  const hasAccess = Boolean(
    profile.accessClientId && profile.accessClientSecret
  );
  let authSummary = "none";
  if (hasBearer && hasAccess) authSummary = "Bearer + Access";
  else if (hasBearer) authSummary = "Bearer";
  else if (hasAccess) authSummary = "Access";

  return {
    mode: conn.mode,
    apiHost: getApiHost(profile.apiBase),
    transport: profile.transport,
    authSummary,
    hint: "hx config transport · hx doctor --security",
  };
}
