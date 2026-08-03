/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DASHBOARD_D1_READ_AUTH_KEY_FIELDS,
  DASHBOARD_TELEGRAM_ALERT_AUTH_KEY_FIELDS,
  DASHBOARD_TRADE_EXECUTE_AUTH_KEY_FIELDS,
  resolveInternalAuthKey,
} from "@hoox-sh/hoox-shared/service-bindings";

export type AuthType = "basic" | "cf-access" | "none";

const DEFAULT_SERVICE_URLS = {
  D1_SERVICE_URL: "https://d1-worker.cryptolinx.workers.dev",
  AGENT_SERVICE_URL: "https://agent-worker.cryptolinx.workers.dev",
  PYNE_WORKER_URL: "https://pyne-worker.cryptolinx.workers.dev",
} as const;

/**
 * Sentinel value the dashboard used to silently fall back to when SESSION_SECRET
 * was unset. Anything matching this must be rejected at the boundary so we
 * never sign cookies with a publicly-known string in production.
 */
const INSECURE_DEFAULT_SESSION_SECRET = "change-me-in-production";

const VALID_AUTH_TYPES: readonly AuthType[] = ["basic", "cf-access", "none"];

export const ENV_KEYS = {
  services: {
    d1: "D1_SERVICE_URL",
    agent: "AGENT_SERVICE_URL",
    pyne: "PYNE_WORKER_URL",
  },
  internalAuth: {
    d1Read: "D1_READ_KEY_BINDING",
    d1Legacy: "D1_INTERNAL_KEY",
    tradeExecute: "TRADE_EXECUTE_KEY_BINDING",
    tradeLegacy: "TRADE_INTERNAL_KEY",
    agent: "AGENT_INTERNAL_KEY",
    telegram: "TELEGRAM_INTERNAL_KEY_BINDING",
    telegramLegacy: "TELEGRAM_INTERNAL_KEY",
    legacy: "INTERNAL_KEY_BINDING",
    api: "API_SERVICE_KEY_BINDING",
    pyne: "PYNE_API_KEY",
  },
  cloudflare: {
    accountId: "CLOUDFLARE_ACCOUNT_ID",
    apiToken: "CLOUDFLARE_API_TOKEN",
    secretStoreId: "CLOUDFLARE_SECRET_STORE_ID",
  },
  auth: {
    type: "AUTH_TYPE",
    username: "DASHBOARD_USER",
    password: "DASHBOARD_PASS",
    cfAccessTeamName: "CF_ACCESS_TEAM_NAME",
    sessionSecret: "SESSION_SECRET",
  },
} as const;

export function getEnvVar(key: string): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Resolve the AUTH_TYPE env var with validation. Unknown values fall back
 * to "basic" rather than crashing so a typo doesn't take down the dashboard.
 */
export function getAuthType(): AuthType {
  const raw = getEnvVar(ENV_KEYS.auth.type);
  if (raw && (VALID_AUTH_TYPES as readonly string[]).includes(raw)) {
    return raw as AuthType;
  }
  return "basic";
}

export function getConfig() {
  return {
    api: {
      d1Service:
        getEnvVar(ENV_KEYS.services.d1) || DEFAULT_SERVICE_URLS.D1_SERVICE_URL,
      agentService:
        getEnvVar(ENV_KEYS.services.agent) ||
        DEFAULT_SERVICE_URLS.AGENT_SERVICE_URL,
      pyneService:
        getEnvVar(ENV_KEYS.services.pyne) ||
        DEFAULT_SERVICE_URLS.PYNE_WORKER_URL,
    },
    internalAuth: {
      d1Read: resolveInternalAuthKey(
        process.env,
        DASHBOARD_D1_READ_AUTH_KEY_FIELDS
      ),
      tradeExecute: resolveInternalAuthKey(
        process.env,
        DASHBOARD_TRADE_EXECUTE_AUTH_KEY_FIELDS
      ),
      agent: getEnvVar(ENV_KEYS.internalAuth.agent),
      telegram: resolveInternalAuthKey(
        process.env,
        DASHBOARD_TELEGRAM_ALERT_AUTH_KEY_FIELDS
      ),
      api: getEnvVar(ENV_KEYS.internalAuth.api),
      pyne: getEnvVar(ENV_KEYS.internalAuth.pyne),
    },
    auth: {
      type: getAuthType(),
      username: getEnvVar(ENV_KEYS.auth.username),
      password: getEnvVar(ENV_KEYS.auth.password),
      cfAccessTeamName: getEnvVar(ENV_KEYS.auth.cfAccessTeamName),
      sessionSecret: getEnvVar(ENV_KEYS.auth.sessionSecret),
    },
  } as const;
}

// Module-load snapshot for backward compat with existing callers.
// New code should prefer getConfig() called per-request so env changes
// (e.g. test setup) are picked up.
export const config = getConfig();

export type ConfigError = {
  key: string;
  message: string;
};

/** Resolved internal auth keys for server-side worker calls. */
export function getInternalAuthKeys() {
  return getConfig().internalAuth;
}

export function validateRequiredEnv(keys: readonly string[]): ConfigError[] {
  return keys
    .filter((key) => !getEnvVar(key))
    .map((key) => ({
      key,
      message: `Missing required environment variable: ${key}`,
    }));
}

/**
 * Throws if the configured session secret is missing or set to the
 * well-known insecure default. Call this from any code that signs
 * session tokens (middleware, login route). In dev (`NODE_ENV=development`)
 * the insecure default is allowed with a console warning.
 */
/**
 * Rejects AUTH_TYPE=none outside development.
 * Call from middleware so production never runs an open dashboard.
 */
export function assertProductionAuthConfigured(): void {
  if (getAuthType() !== "none") {
    return;
  }
  if (process.env.NODE_ENV === "development") {
    console.warn("[config] AUTH_TYPE=none is acceptable in development only.");
    return;
  }
  throw new Error(
    "AUTH_TYPE=none is not permitted in production. Set AUTH_TYPE=basic or cf-access."
  );
}

export function requireSafeSessionSecret(): string {
  const secret = getEnvVar(ENV_KEYS.auth.sessionSecret);
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured. Set it via `wrangler secret put SESSION_SECRET` or .dev.vars for local dev."
    );
  }
  if (secret === INSECURE_DEFAULT_SESSION_SECRET) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[config] SESSION_SECRET is the insecure default. Acceptable in dev; rotate before deploying."
      );
      return secret;
    }
    throw new Error(
      "SESSION_SECRET is set to the publicly-known default value. Rotate it via `wrangler secret put SESSION_SECRET`."
    );
  }
  return secret;
}
