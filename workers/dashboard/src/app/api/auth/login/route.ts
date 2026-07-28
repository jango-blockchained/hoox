/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ENV_KEYS,
  getAuthType,
  getConfig,
  requireSafeSessionSecret,
  validateRequiredEnv,
} from "@/lib/config";
import { Errors } from "@jango-blockchained/hoox-shared/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  _context: { params: Promise<Record<string, unknown>> }
) {
  try {
    // C-7: when AUTH_TYPE is cf-access, login is handled by the CF Access
    // proxy before the request reaches this worker. The login form should
    // not even be reachable, but if it is, return a clear 400.
    const authType = getAuthType();
    if (authType === "cf-access") {
      return NextResponse.json(
        { error: "Login is handled by Cloudflare Access. No password login." },
        { status: 400 }
      );
    }
    if (authType === "none") {
      return NextResponse.json({ success: true });
    }

    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const username = body?.username;
    const password = body?.password;

    const configErrors = validateRequiredEnv([
      ENV_KEYS.auth.username,
      ENV_KEYS.auth.password,
    ]);
    if (configErrors.length > 0) {
      return NextResponse.json(
        { error: "Configuration error", missing: configErrors },
        { status: 500 }
      );
    }

    // C-4: refuse to mint a session cookie with an insecure secret.
    // In dev this warns + continues; in production it throws (caught below
    // and returned as a 500 with a sanitized message).
    requireSafeSessionSecret();

    const validUsername = getConfig().auth.username;
    const validPassword = getConfig().auth.password;

    if (username !== validUsername || password !== validPassword) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("session", username ?? "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (err) {
    if (err instanceof Error && err.message.includes("SESSION_SECRET")) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }
    return Errors.badRequest(`Invalid request: ${err}`);
  }
}

export async function DELETE(
  _request: NextRequest,
  _context: { params: Promise<Record<string, unknown>> }
) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("session");
  return response;
}
