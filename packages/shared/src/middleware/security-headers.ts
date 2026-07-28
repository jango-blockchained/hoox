/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Security Headers middleware for Cloudflare Workers
 * Provides standardized security headers for all worker responses
 *
 * @available — Available for consumer use. Import from "@jango-blockchained/hoox-shared/middleware".
 */

export interface SecurityHeadersOptions {
  /** X-Content-Type-Options (default: "nosniff") */
  xContentTypeOptions?: string;
  /** X-Frame-Options (default: "DENY") */
  xFrameOptions?: string;
  /** X-XSS-Protection (default: "1; mode=block") */
  xXssProtection?: string;
  /** Referrer-Policy (default: "strict-origin-when-cross-origin") */
  referrerPolicy?: string;
  /** Permissions-Policy (default: restrictive — all disabled) */
  permissionsPolicy?: string;
  /** Strict-Transport-Security (default: "max-age=31536000; includeSubDomains") */
  strictTransportSecurity?: string;
  /** Content-Security-Policy (default: "default-src 'self'") */
  contentSecurityPolicy?: string;
}

export const SECURITY_HEADERS_DEFAULTS: Required<SecurityHeadersOptions> = {
  xContentTypeOptions: "nosniff",
  xFrameOptions: "DENY",
  xXssProtection: "1; mode=block",
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy:
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  contentSecurityPolicy: "default-src 'self'",
};

/**
 * Create security headers object for use in responses.
 * Merges provided options over defaults.
 */
export function secureHeaders(
  options?: SecurityHeadersOptions
): Record<string, string> {
  const opts = { ...SECURITY_HEADERS_DEFAULTS, ...options };
  const headers: Record<string, string> = {
    "X-Content-Type-Options": opts.xContentTypeOptions,
    "X-Frame-Options": opts.xFrameOptions,
    "X-XSS-Protection": opts.xXssProtection,
    "Referrer-Policy": opts.referrerPolicy,
    "Permissions-Policy": opts.permissionsPolicy,
    "Strict-Transport-Security": opts.strictTransportSecurity,
  };
  // Only include CSP if set (some workers may want to disable it)
  if (opts.contentSecurityPolicy) {
    headers["Content-Security-Policy"] = opts.contentSecurityPolicy;
  }
  return headers;
}

/**
 * Wrap an existing Response with security headers.
 * Preserves existing response headers (security headers take precedence).
 *
 * @example
 *   return wrapWithSecurityHeaders(
 *     createJsonResponse({ success: true }, 200)
 *   );
 */
export function wrapWithSecurityHeaders(
  response: Response,
  options?: SecurityHeadersOptions
): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(secureHeaders(options))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
