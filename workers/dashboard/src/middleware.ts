/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { secureHeaders } from "@hoox-sh/hoox-shared/middleware";
import { timingSafeEqual } from "@hoox-sh/hoox-shared/middleware/auth";
import { assertProductionAuthConfigured } from "./lib/config";

let productionAuthChecked = false;
function ensureProductionAuth(): void {
  if (productionAuthChecked) return;
  assertProductionAuthConfigured();
  productionAuthChecked = true;
}

/**
 * CSP relaxed for Next.js client-side hydration.
 * Next.js uses inline scripts (RSC payload, bootstrap) and loads
 * JS/CSS from `/_next/static/`. The login page also loads a noise
 * overlay from grainy-gradients.vercel.app (CSS background-image).
 */
const NEXTJS_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://grainy-gradients.vercel.app",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
].join("; ");

/**
 * Apply security headers to any NextResponse.
 * Dashboard uses a relaxed CSP for Next.js client-side hydration.
 */
function withSecurityHeaders(response: NextResponse): NextResponse {
  const headers = secureHeaders({ contentSecurityPolicy: NEXTJS_CSP });
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

function getRedirectUrl(request: NextRequest): string {
  try {
    return new URL("/login", request.url).toString();
  } catch {
    return "/login";
  }
}

export function middleware(request: NextRequest) {
  try {
    ensureProductionAuth();
    const { pathname } = request.nextUrl;

    // Skip auth for static files, login, and auth API
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/api/auth") ||
      pathname === "/favicon.ico"
    ) {
      return withSecurityHeaders(NextResponse.next());
    }

    // CSRF protection for state-changing requests
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const origin = request.headers?.get("origin");
      const host = request.headers?.get("host");
      if (origin && host && !origin.includes(host)) {
        return withSecurityHeaders(
          NextResponse.json({ error: "CSRF: Origin mismatch" }, { status: 403 })
        );
      }
    }

    // NOTE: Next.js middleware cannot access the Cloudflare `env` binding directly.
    // The `env` parameter is only available in route handlers via `getCloudflareContext().env`.
    // OpenNext's cloudflare-edge wrapper (handler.mjs) copies string bindings to `process.env`
    // before invoking the Next.js middleware, so `process.env.DASHBOARD_USER` works for vars.
    // If DASHBOARD_USER were a secret (not a var), this would not work — secrets are not
    // copied to process.env. For secrets, the architecture would need to change (e.g., passing
    // env through the converter or using a different auth pattern in middleware).

    // C-7: respect AUTH_TYPE. With cf-access, the CF Access proxy authenticates
    // before the request reaches the worker; we just need to let it through.
    // With "none", no auth is required (dev only).
    const authType = process.env.AUTH_TYPE ?? "basic";
    if (authType === "cf-access" || authType === "none") {
      return withSecurityHeaders(NextResponse.next());
    }

    if (!process.env.DASHBOARD_USER) {
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(
          NextResponse.json(
            { error: "Server misconfigured: DASHBOARD_USER not set" },
            { status: 500 }
          )
        );
      }
      return withSecurityHeaders(
        NextResponse.redirect(getRedirectUrl(request))
      );
    }

    let session: string | undefined;
    try {
      session = request.cookies?.get("session")?.value;
    } catch {
      // If cookie access fails, treat as unauthenticated
    }
    const expectedUser = process.env.DASHBOARD_USER;

    if (!session || !timingSafeEqual(session, expectedUser)) {
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        );
      }
      return withSecurityHeaders(
        NextResponse.redirect(getRedirectUrl(request))
      );
    }

    return withSecurityHeaders(NextResponse.next());
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
