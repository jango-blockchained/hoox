/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

// Shared helper module for k6 load tests
// Provides auth config, payload builders, check functions, and default thresholds
//
// Usage: import { getBaseUrl, getAuthHeaders, ... } from "./helpers.js";

import { check } from "k6";
import http from "k6/http";

// ── Base URL ──────────────────────────────────────────────────────────────
// Defaults to local wrangler dev. Override via BASE_URL env var for CI/preview.

export function getBaseUrl() {
  return __ENV.BASE_URL || "http://localhost:8787";
}

// ── Auth Headers ──────────────────────────────────────────────────────────
// Internal worker auth uses X-Internal-Auth-Key header matching INTERNAL_KEY_BINDING secret.

export function getAuthHeaders() {
  const key = __ENV.INTERNAL_AUTH_KEY || "local_dev_key";
  return {
    "Content-Type": "application/json",
    "X-Internal-Auth-Key": key,
  };
}

// ── Webhook API Key ───────────────────────────────────────────────────────
// hoox gateway authenticates external webhooks via apiKey field in the JSON body.

export function getWebhookApiKey() {
  return __ENV.HOOX_API_KEY || "test_webhook_api_key";
}

// ── Payload Builders ──────────────────────────────────────────────────────

/**
 * Builds a realistic TradingView-style webhook alert payload
 * for the hoox gateway (POST /webhook).
 *
 * @param {object} overrides - Optional field overrides
 * @returns {object} Webhook payload
 */
export function getWebhookPayload(overrides = {}) {
  const base = {
    apiKey: getWebhookApiKey(),
    exchange: "bybit",
    action: "LONG",
    symbol: "BTCUSDT",
    quantity: 0.002,
    price: 67450,
    leverage: 10,
    notifyTelegram: true,
  };
  return { ...base, ...overrides };
}

/**
 * Builds a D1 SELECT query payload for the d1-worker (POST /query).
 *
 * @param {object} overrides - Optional field overrides
 * @returns {object} Query payload
 */
export function getD1QueryPayload(overrides = {}) {
  const base = {
    query:
      "SELECT id, symbol, action, quantity, price, status, created_at FROM positions ORDER BY created_at DESC LIMIT 10",
    params: [],
  };
  return { ...base, ...overrides };
}

/**
 * Builds a D1 batch payload for the d1-worker (POST /batch).
 *
 * @param {object} overrides - Optional field overrides
 * @returns {object} Batch payload
 */
export function getD1BatchPayload(overrides = {}) {
  const base = {
    statements: [
      {
        query: "SELECT COUNT(*) as count FROM positions WHERE status = 'open'",
        params: [],
      },
      {
        query:
          "SELECT SUM(pnl) as total_pnl FROM trades WHERE created_at > datetime('now', '-24 hours')",
        params: [],
      },
    ],
  };
  return { ...base, ...overrides };
}

// ── Check Functions ───────────────────────────────────────────────────────

/**
 * Validates a successful HTTP response (2xx status).
 *
 * @param {Response} res - k6 HTTP response object
 * @param {string} label - Check label for reporting
 * @returns {boolean} Whether all checks passed
 */
export function checkSuccess(res, label = "response") {
  return check(res, {
    [`${label} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${label} body is valid JSON`]: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });
}

/**
 * Validates response latency against a threshold.
 *
 * @param {Response} res - k6 HTTP response object
 * @param {number} maxMs - Maximum acceptable latency in milliseconds
 * @param {string} label - Check label for reporting
 * @returns {boolean} Whether the latency check passed
 */
export function checkLatency(res, maxMs = 2000, label = "response") {
  return check(res, {
    [`${label} latency < ${maxMs}ms`]: (r) => r.timings.duration < maxMs,
  });
}

/**
 * Validates both success and latency for a response.
 *
 * @param {Response} res - k6 HTTP response object
 * @param {number} maxMs - Maximum acceptable latency in milliseconds
 * @param {string} label - Check label for reporting
 * @returns {boolean} Whether all checks passed
 */
export function checkResponse(res, maxMs = 2000, label = "response") {
  const success = checkSuccess(res, label);
  const latency = checkLatency(res, maxMs, label);
  return success && latency;
}

// ── Default Thresholds ────────────────────────────────────────────────────

/**
 * Returns a threshold config object suitable for k6's options.thresholds.
 * Adjust via THRESHOLD_P95 and THRESHOLD_P99 env vars.
 *
 * @param {object} overrides - Additional thresholds to merge
 * @returns {object} Thresholds configuration
 */
export function getDefaultThresholds(overrides = {}) {
  const p95ms = parseInt(__ENV.THRESHOLD_P95) || 2000;
  const p99ms = parseInt(__ENV.THRESHOLD_P99) || 5000;
  const maxFailRate = parseFloat(__ENV.THRESHOLD_FAIL_RATE) || 0.01;

  return {
    http_req_duration: [`p(95)<${p95ms}`, `p(99)<${p99ms}`],
    http_req_failed: [`rate<${maxFailRate}`],
    ...overrides,
  };
}

// ── URL Builders ──────────────────────────────────────────────────────────

/**
 * Returns the full URL for a given worker path.
 *
 * @param {string} path - URL path (e.g., "/webhook", "/health")
 * @returns {string} Full URL
 */
export function url(path) {
  return `${getBaseUrl()}${path}`;
}

// ── Health Check ──────────────────────────────────────────────────────────

/**
 * Quick health check to verify the target is reachable.
 * Useful as a setup step before running the actual load test.
 *
 * @returns {boolean} Whether the health check passed
 */
export function healthCheck() {
  const res = http.get(url("/health"));
  return check(res, {
    "health endpoint responds": (r) => r.status === 200,
  });
}
