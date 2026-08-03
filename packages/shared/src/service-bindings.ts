/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { collectInternalAuthKeys } from "./middleware/auth";
import type { InternalAuthEnv, InternalAuthKeyName } from "./middleware/auth";

export interface ServiceBinding {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>;
}

/** Env binding names for scoped internal auth keys. */
export const InternalAuthKeyFields = {
  DEFAULT: "INTERNAL_KEY_BINDING",
  D1_READ: "D1_READ_KEY_BINDING",
  D1_WRITE: "D1_WRITE_KEY_BINDING",
  TRADE_EXECUTE: "TRADE_EXECUTE_KEY_BINDING",
  TRADE_READ: "TRADE_READ_KEY_BINDING",
  TELEGRAM_ALERT: "TELEGRAM_INTERNAL_KEY_BINDING",
  WALLET_EXECUTE: "WALLET_EXECUTE_KEY_BINDING",
  AGENT: "AGENT_INTERNAL_KEY",
  /** Dashboard Pages secret aliases (legacy naming). */
  D1_INTERNAL_ALIAS: "D1_INTERNAL_KEY",
  TRADE_INTERNAL_ALIAS: "TRADE_INTERNAL_KEY",
  TELEGRAM_INTERNAL_ALIAS: "TELEGRAM_INTERNAL_KEY",
} as const;

/** d1-worker read routes: prefer read-only key, fall back to legacy full key. */
export const D1_READ_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.D1_READ,
  InternalAuthKeyFields.DEFAULT,
] as const;

/** d1-worker write/RPC routes: prefer write key, fall back to legacy full key. */
export const D1_WRITE_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.D1_WRITE,
  InternalAuthKeyFields.DEFAULT,
] as const;

/** trade-worker execute routes (/webhook, /process, POST /api/signals). */
export const TRADE_EXECUTE_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.TRADE_EXECUTE,
  InternalAuthKeyFields.DEFAULT,
  InternalAuthKeyFields.AGENT,
] as const;

/** trade-worker read routes (GET /api/signals, GET /report). */
export const TRADE_READ_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.TRADE_READ,
  InternalAuthKeyFields.DEFAULT,
] as const;

/** telegram-worker /alert notification endpoint. */
export const TELEGRAM_ALERT_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.TELEGRAM_ALERT,
  InternalAuthKeyFields.DEFAULT,
] as const;

/** web3-wallet-worker privileged routes. */
export const WALLET_EXECUTE_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.WALLET_EXECUTE,
  InternalAuthKeyFields.DEFAULT,
] as const;

/** Dashboard → d1-worker read calls (includes Pages secret aliases). */
export const DASHBOARD_D1_READ_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.D1_READ,
  InternalAuthKeyFields.D1_INTERNAL_ALIAS,
  InternalAuthKeyFields.DEFAULT,
] as const;

/** Dashboard → trade-worker execute calls. */
export const DASHBOARD_TRADE_EXECUTE_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.TRADE_EXECUTE,
  InternalAuthKeyFields.TRADE_INTERNAL_ALIAS,
  InternalAuthKeyFields.DEFAULT,
] as const;

/** Dashboard → telegram-worker /alert calls. */
export const DASHBOARD_TELEGRAM_ALERT_AUTH_KEY_FIELDS = [
  InternalAuthKeyFields.TELEGRAM_ALERT,
  InternalAuthKeyFields.TELEGRAM_INTERNAL_ALIAS,
  InternalAuthKeyFields.DEFAULT,
] as const;

/** First configured key from an ordered fallback list. */
export function resolveInternalAuthKey(
  env: object,
  keyFields: InternalAuthKeyName
): string | undefined {
  return collectInternalAuthKeys(env as InternalAuthEnv, keyFields)[0];
}

export interface AuthenticatedServiceEnv {
  INTERNAL_KEY_BINDING?: string;
  D1_READ_KEY_BINDING?: string;
  D1_WRITE_KEY_BINDING?: string;
  TRADE_EXECUTE_KEY_BINDING?: string;
  TRADE_READ_KEY_BINDING?: string;
  TELEGRAM_INTERNAL_KEY_BINDING?: string;
  WALLET_EXECUTE_KEY_BINDING?: string;
  AGENT_INTERNAL_KEY?: string;
  D1_INTERNAL_KEY?: string;
  TRADE_INTERNAL_KEY?: string;
  TELEGRAM_INTERNAL_KEY?: string;
}

export class ServiceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceAuthError";
  }
}

/**
 * serviceFetch with fail-closed internal auth.
 * Injects X-Internal-Auth-Key from env.INTERNAL_KEY_BINDING.
 */
export function authenticatedServiceFetch<E extends AuthenticatedServiceEnv>(
  binding: ServiceBinding,
  env: E,
  path: string,
  body?: unknown,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    timeout?: number;
    /** Override env key (e.g. TELEGRAM_INTERNAL_KEY_BINDING, AGENT_INTERNAL_KEY) */
    internalKey?: string;
    /** Ordered env fields to try when internalKey is not set */
    internalKeyFields?: InternalAuthKeyName;
  }
): Promise<Response> {
  const key =
    options?.internalKey ??
    (options?.internalKeyFields
      ? resolveInternalAuthKey(env, options.internalKeyFields)
      : env.INTERNAL_KEY_BINDING);
  if (!key) {
    const label = options?.internalKeyFields
      ? Array.isArray(options.internalKeyFields)
        ? options.internalKeyFields.join(" | ")
        : options.internalKeyFields
      : "INTERNAL_KEY_BINDING";
    return Promise.reject(new ServiceAuthError(`${label} not configured`));
  }
  return serviceFetch(binding, path, body, {
    method: options?.method,
    timeout: options?.timeout,
    headers: {
      ...options?.headers,
      "X-Internal-Auth-Key": key,
    },
  });
}

export function serviceFetch(
  binding: ServiceBinding,
  path: string,
  body?: unknown,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    timeout?: number;
  }
): Promise<Response> {
  const timeout = options?.timeout ?? 30000;
  return binding.fetch(`http://internal${path}`, {
    method: options?.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
}
