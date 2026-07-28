/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authentication middleware for Cloudflare Workers
 * Provides both Bearer token auth and internal service-to-service auth
 */

import type { Env } from "../types";
import type { MiddlewareHandler } from "../types/router";

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Length is NOT short-circuited: both strings are hashed to fixed-size
 * digests via a simple XOR-fold into equal-length buffers so that
 * unequal lengths do not leak via early return (length oracle).
 *
 * Note: true crypto.subtle.timingSafeEqual needs equal-length ArrayBuffers;
 * we pad both encodings to the same max length before XOR comparison.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  // Pad to shared length so comparison time does not depend on min(lenA, lenB)
  // alone, and so unequal lengths still take a full pass.
  const len = Math.max(aBuf.length, bBuf.length);
  // Also mix in length difference so equal-prefix different-length still fails.
  let result = aBuf.length === bBuf.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const av = i < aBuf.length ? aBuf[i] : 0;
    const bv = i < bBuf.length ? bBuf[i] : 0;
    result |= av ^ bv;
  }
  return result === 0;
}

/**
 * Environment bindings accepted for operator Bearer auth.
 * Prefer OPERATOR_API_KEY; INTERNAL_API_KEY remains a legacy alias.
 */
export interface OperatorAuthEnv {
  OPERATOR_API_KEY?: string;
  INTERNAL_API_KEY?: string;
  [key: string]: unknown;
}

/**
 * Resolve the operator API secret from Worker env.
 * Order: OPERATOR_API_KEY → INTERNAL_API_KEY (legacy).
 */
export function resolveOperatorApiKey(
  env: OperatorAuthEnv | Env
): string | undefined {
  const preferred = env.OPERATOR_API_KEY;
  if (typeof preferred === "string" && preferred.length > 0) {
    return preferred;
  }
  const legacy = env.INTERNAL_API_KEY;
  if (typeof legacy === "string" && legacy.length > 0) {
    return legacy;
  }
  return undefined;
}

/**
 * Require Bearer token authentication via Authorization header.
 * Use for external operator / management API endpoints.
 *
 * Secret resolution: `OPERATOR_API_KEY` (preferred) or `INTERNAL_API_KEY` (legacy).
 * Client should send the same value as `HOOX_API_TOKEN`.
 */
export async function requireAuth(
  request: Request,
  env: Env | OperatorAuthEnv
): Promise<Response | null> {
  return requireOperatorAuth(request, env);
}

/**
 * Explicit operator-plane auth (alias of requireAuth with clearer naming).
 * Fail-closed when no operator key is configured.
 */
export async function requireOperatorAuth(
  request: Request,
  env: OperatorAuthEnv | Env
): Promise<Response | null> {
  const apiKey = resolveOperatorApiKey(env);
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "Operator API key not configured",
        hint: "Set OPERATOR_API_KEY (preferred) or INTERNAL_API_KEY on the Worker",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const authHeader = request.headers.get("Authorization");
  const expectedHeader = `Bearer ${apiKey}`;
  if (!authHeader || !timingSafeEqual(authHeader, expectedHeader)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/**
 * Router middleware that enforces operator Bearer auth.
 * Usage: router.get("/v1/workers", handler, [createOperatorAuthMiddleware()])
 */
export function createOperatorAuthMiddleware(): MiddlewareHandler<OperatorAuthEnv> {
  return async (
    request: Request,
    env: OperatorAuthEnv,
    _ctx: ExecutionContext
  ): Promise<Response | void> => {
    const denied = await requireOperatorAuth(request, env);
    if (denied) return denied;
    return;
  };
}

/**
 * Environment with an internal auth key binding.
 * Workers that accept internal service-to-service requests should extend this.
 * Note: Uses [key: string]: unknown for compatibility with dynamic key access.
 * This is intentionally less strict than wrangler-generated Env to allow
 * InternalAuthEnv to be satisfied by actual Env bindings at runtime.
 */
export interface InternalAuthEnv {
  [key: string]: unknown;
}

export type InternalAuthKeyName = string | readonly string[];

function normalizeKeyNames(keyName: InternalAuthKeyName): string[] {
  if (typeof keyName === "string") {
    return [keyName];
  }
  return [...keyName];
}

/** Collect configured secrets for one or more env binding names (first wins for callers). */
export function collectInternalAuthKeys(
  env: InternalAuthEnv,
  keyNames: InternalAuthKeyName
): string[] {
  const keys: string[] = [];
  for (const name of normalizeKeyNames(keyNames)) {
    const value = env[name];
    if (typeof value === "string" && value.length > 0) {
      keys.push(value);
    }
  }
  return keys;
}

function matchesAnyInternalAuthKey(
  providedKey: string,
  expectedKeys: string[]
): boolean {
  for (const expected of expectedKeys) {
    if (timingSafeEqual(providedKey, expected)) {
      return true;
    }
  }
  return false;
}

function internalAuthNotConfiguredResponse(
  keyNames: InternalAuthKeyName
): Response {
  const label = normalizeKeyNames(keyNames).join(" | ");
  return new Response(
    JSON.stringify({
      success: false,
      error: `Internal auth key(s) not configured: ${label}`,
    }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Require internal service-to-service authentication via X-Internal-Auth-Key header.
 * Use for endpoints called by other workers via Service Bindings.
 *
 * Fails closed: if the expected key is not configured in env, the request is rejected.
 * This prevents accidental exposure of unprotected internal endpoints.
 *
 * @param request - The incoming request
 * @param env - Worker environment containing the expected key
 * @param keyName - The env binding name for the internal key (default: 'INTERNAL_KEY_BINDING')
 * @returns Response if unauthorized, null if authorized
 */
export function requireInternalAuth(
  request: Request,
  env: InternalAuthEnv,
  keyName: InternalAuthKeyName = "INTERNAL_KEY_BINDING"
): Response | null {
  const expectedKeys = collectInternalAuthKeys(env, keyName);
  if (expectedKeys.length === 0) {
    return internalAuthNotConfiguredResponse(keyName);
  }

  const providedKey = request.headers.get("X-Internal-Auth-Key");
  if (!providedKey || !matchesAnyInternalAuthKey(providedKey, expectedKeys)) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

/**
 * Create a middleware function for the router that enforces internal auth.
 * Returns a Response (401) when unauthorized, or void when authorized.
 *
 * Usage: router.get("/path", handler, [createInternalAuthMiddleware()])
 *
 * @param keyName - The env binding name for the internal key (default: 'INTERNAL_KEY_BINDING')
 */
export function createInternalAuthMiddleware(
  keyName: InternalAuthKeyName = "INTERNAL_KEY_BINDING"
): MiddlewareHandler<InternalAuthEnv> {
  return async (
    request: Request,
    env: InternalAuthEnv,
    _ctx: ExecutionContext
  ): Promise<Response | void> => {
    const expectedKeys = collectInternalAuthKeys(env, keyName);
    if (expectedKeys.length === 0) {
      return internalAuthNotConfiguredResponse(keyName);
    }

    const providedKey = request.headers.get("X-Internal-Auth-Key");
    if (!providedKey || !matchesAnyInternalAuthKey(providedKey, expectedKeys)) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return;
  };
}

/**
 * Check internal auth and return a result object (non-throwing pattern).
 * Useful when you need to check auth without immediately returning a response.
 *
 * @param request - The incoming request
 * @param env - Worker environment containing the expected key
 * @param keyName - The env binding name for the internal key (default: 'INTERNAL_KEY_BINDING')
 * @returns Object with authorized flag and optional error message
 */
export function checkInternalAuth(
  request: Request,
  env: InternalAuthEnv,
  keyName: InternalAuthKeyName = "INTERNAL_KEY_BINDING"
): { authorized: boolean; error?: string } {
  const expectedKeys = collectInternalAuthKeys(env, keyName);
  if (expectedKeys.length === 0) {
    return {
      authorized: false,
      error: `${normalizeKeyNames(keyName).join(" | ")} not configured`,
    };
  }

  const providedKey = request.headers.get("X-Internal-Auth-Key");
  if (!providedKey || !matchesAnyInternalAuthKey(providedKey, expectedKeys)) {
    return { authorized: false, error: "Unauthorized" };
  }

  return { authorized: true };
}
