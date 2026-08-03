/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CORS middleware for Cloudflare Workers
 * Provides standardized CORS headers and preflight handling
 *
 * Security default: NO open origin (*). Internal service-binding workers
 * should not advertise browser CORS at all. Public endpoints must pass
 * an explicit allowOrigin (or use publicCorsHeaders()).
 *
 * @available — Available for consumer use. Import from "@hoox-sh/hoox-shared/middleware".
 */

export interface CorsEnv {
  CORS_ALLOW_ORIGIN?: string;
}

export interface CorsOptions {
  /**
   * Allowed origins. Empty / omitted = no Access-Control-Allow-Origin header
   * (fail-closed). Never defaults to "*".
   */
  allowOrigin?: string;
  /** Allowed methods (default: "GET, POST, OPTIONS, PUT, DELETE") */
  allowMethods?: string;
  /** Allowed headers (default: "Content-Type, Authorization, X-Request-ID") */
  allowHeaders?: string;
  /** Whether to include credentials (default: false) */
  allowCredentials?: boolean;
  /** Max age for preflight cache (default: 86400 = 24h) */
  maxAge?: number;
}

const DEFAULT_OPTIONS: Required<CorsOptions> = {
  // Fail-closed: do not open browser cross-origin by default.
  // Callers that need CORS must pass allowOrigin explicitly.
  allowOrigin: "",
  allowMethods: "GET, POST, OPTIONS, PUT, DELETE",
  // Do NOT advertise X-Internal-Auth-Key as a browser CORS header —
  // that key is for service-to-service only and must never be sent from JS.
  allowHeaders: "Content-Type, Authorization, X-Request-ID",
  allowCredentials: false,
  maxAge: 86400,
};

/**
 * Create CORS headers object for use in responses.
 * Omits Access-Control-Allow-Origin when allowOrigin is empty.
 */
export function corsHeaders(options?: CorsOptions): Record<string, string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": opts.allowMethods,
    "Access-Control-Allow-Headers": opts.allowHeaders,
    "Access-Control-Max-Age": String(opts.maxAge),
  };
  if (opts.allowOrigin) {
    headers["Access-Control-Allow-Origin"] = opts.allowOrigin;
  }
  if (opts.allowCredentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

/**
 * CORS headers for truly public browser-facing APIs.
 * Prefer a concrete origin over "*" whenever possible.
 */
export function publicCorsHeaders(
  origin: string = "*",
  options?: Omit<CorsOptions, "allowOrigin">
): Record<string, string> {
  return corsHeaders({ ...options, allowOrigin: origin });
}

/**
 * CORS headers for internal workers (service bindings only).
 * Returns an empty object — no browser CORS surface.
 */
export function internalCorsHeaders(): Record<string, string> {
  return {};
}

/**
 * Resolve CORS from env + request for dashboard-facing workers.
 * Set CORS_ALLOW_ORIGIN to a comma-separated browser origin allowlist.
 */
export function resolveCorsOptions(
  request: Request,
  // Accept any wrangler Env / bag without requiring CORS_ALLOW_ORIGIN
  // on every worker interface (avoids "no common properties" TS2559).
  env?: unknown
): CorsOptions {
  const raw =
    env &&
    typeof env === "object" &&
    "CORS_ALLOW_ORIGIN" in env &&
    typeof (env as CorsEnv).CORS_ALLOW_ORIGIN === "string"
      ? (env as CorsEnv).CORS_ALLOW_ORIGIN
      : undefined;
  const configured = raw?.trim();
  if (!configured) {
    return {};
  }

  const allowed = configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin");

  if (origin && allowed.includes(origin)) {
    return { allowOrigin: origin, allowCredentials: true };
  }

  if (!origin && allowed.length === 1) {
    return { allowOrigin: allowed[0] };
  }

  return {};
}

/**
 * Handle CORS preflight (OPTIONS) requests.
 * Returns a Response for OPTIONS, or null for non-OPTIONS requests.
 */
export function handleCorsPreflightRequest(
  request: Request,
  options?: CorsOptions
): Response | null {
  if (request.method !== "OPTIONS") return null;

  return new Response(null, {
    status: 204,
    headers: corsHeaders(options),
  });
}
