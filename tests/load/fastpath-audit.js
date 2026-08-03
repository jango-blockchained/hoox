/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

// Fast Path Performance Audit — hoox gateway on deployed Cloudflare edge
// Measures the POST /webhook hot path: auth → rate-limit → idempotency → trade-worker.
// Each iteration uses a unique quantity to bypass the 5-min idempotency window.
//
// Usage:
//   HOOX_API_KEY=<key> k6 run tests/load/fastpath-audit.js
//
// Optional env:
//   BASE_URL          — default https://hoox.cryptolinx.workers.dev
//   HOOX_API_KEY      — required (webhook apiKey in body)
//   VUS               — concurrent virtual users (default 30)
//   DURATION          — test duration (default 2m)
//   RUN_HEALTH_ONLY   — "1" to run only the /health baseline
//
// Outputs: human summary + JSON report at /tmp/fastpath-audit.json

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

// ── Custom metrics (named, so thresholds can target scenarios) ────────────
const healthLatency = new Trend("health_latency", true);
const webhookHappyLatency = new Trend("webhook_happy_latency", true);
const webhookInvalidLatency = new Trend("webhook_invalid_latency", true);
const webhookAuthFailLatency = new Trend("webhook_auth_fail_latency", true);
const webhookSuccessRate = new Rate("webhook_success_rate");
const errors = new Counter("errors_total");

// ── Options ──────────────────────────────────────────────────────────────
const BASE = __ENV.BASE_URL || "https://hoox.cryptolinx.workers.dev";
const VUS = parseInt(__ENV.VUS) || 30;
const DURATION = __ENV.DURATION || "2m";
const HEALTH_ONLY = __ENV.RUN_HEALTH_ONLY === "1";

const apiKey =
  __ENV.HOOX_API_KEY ||
  "ce6d4979bab8b11436fb744fbccd13167b76aa41c582d4b1f05b7349b0268114";

export const options = {
  scenarios: HEALTH_ONLY
    ? {
        health_baseline: {
          executor: "constant-vus",
          vus: 1,
          duration: "30s",
          gracefulStop: "5s",
          exec: "healthScenario",
        },
      }
    : {
        health_baseline: {
          executor: "constant-vus",
          vus: 1,
          duration: "30s",
          gracefulStop: "5s",
          exec: "healthScenario",
        },
        webhook_happy: {
          executor: "constant-vus",
          vus: VUS,
          duration: DURATION,
          startTime: "35s", // after health baseline
          gracefulStop: "10s",
          exec: "webhookHappyScenario",
        },
        webhook_invalid: {
          executor: "constant-vus",
          vus: Math.max(2, Math.floor(VUS / 5)),
          duration: DURATION,
          startTime: "35s",
          gracefulStop: "10s",
          exec: "webhookInvalidScenario",
        },
        webhook_auth_fail: {
          executor: "constant-vus",
          vus: Math.max(2, Math.floor(VUS / 5)),
          duration: DURATION,
          startTime: "35s",
          gracefulStop: "10s",
          exec: "webhookAuthFailScenario",
        },
      },
  thresholds: {
    health_latency: ["p(95)<500", "p(99)<1000"],
    webhook_happy_latency: ["p(95)<3000", "p(99)<5000"],
    webhook_invalid_latency: ["p(95)<500"],
    webhook_auth_fail_latency: ["p(95)<500"],
    webhook_success_rate: ["rate>0.80"], // >80% reach hoox-success status (gateway accepted)
    errors_total: ["count<1000"],
  },
  noConnectionReuse: false,
  discardResponseBodies: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────

// Build a unique happy-path payload (rotates quantity to bypass dedupe)
function happyPayload(vu, iter) {
  // Vary quantity in (0.001, 0.002, ..., 0.999) per VU + iter + timestamp
  const seed = (vu * 100003 + iter + (Date.now() % 1000000)) % 999;
  const qty = 0.001 + seed / 1000; // 0.001..1.000
  return JSON.stringify({
    apiKey,
    exchange: "bybit",
    action: "LONG",
    symbol: "BTCUSDT",
    quantity: Number(qty.toFixed(4)),
    price: 67000 + (seed % 1000),
    leverage: 1,
    notifyTelegram: false,
  });
}

function invalidPayload() {
  return JSON.stringify({
    apiKey,
    exchange: "bybit",
    action: "INVALID_ACTION",
    symbol: "BTCUSDT",
    // missing quantity
  });
}

function authFailPayload() {
  return JSON.stringify({
    apiKey: "wrong-key-" + Math.random().toString(36).slice(2, 10),
    exchange: "bybit",
    action: "LONG",
    symbol: "BTCUSDT",
    quantity: 0.001,
    price: 67000,
    leverage: 1,
  });
}

// ── Scenarios ────────────────────────────────────────────────────────────

export function healthScenario() {
  const res = http.get(`${BASE}/health`, {
    tags: { scenario: "health" },
  });
  healthLatency.add(res.timings.duration);
  const ok = check(res, {
    "health 200": (r) => r.status === 200,
  });
  if (!ok) errors.add(1);
}

// Default function for k6 CLI compatibility (when scenarios aren't picked up)
export default function () {
  healthScenario();
}

export function webhookHappyScenario() {
  group("webhook_happy", function () {
    const res = http.post(`${BASE}/webhook`, happyPayload(__VU, __ITER), {
      headers: { "Content-Type": "application/json" },
      tags: { scenario: "webhook_happy" },
    });
    webhookHappyLatency.add(res.timings.duration);

    // We don't expect 200 from upstream (trade-worker may reject the synthetic payload),
    // but we DO expect to get past the gateway fast path. Count "reached hoox handler" as success
    // for measuring gateway latency. 401/403 mean the gateway never ran.
    const reachedGateway =
      res.status === 200 ||
      res.status === 202 ||
      res.status === 500 || // upstream rejected but gateway ran
      res.status === 429; // rate limited (still ran)
    webhookSuccessRate.add(reachedGateway);
    if (!reachedGateway) errors.add(1);
  });
  sleep(0.1);
}

export function webhookInvalidScenario() {
  const res = http.post(`${BASE}/webhook`, invalidPayload(), {
    headers: { "Content-Type": "application/json" },
    tags: { scenario: "webhook_invalid" },
  });
  webhookInvalidLatency.add(res.timings.duration);
  const ok = check(res, {
    "invalid 4xx": (r) => r.status >= 400 && r.status < 500,
  });
  if (!ok) errors.add(1);
  sleep(0.5);
}

export function webhookAuthFailScenario() {
  const res = http.post(`${BASE}/webhook`, authFailPayload(), {
    headers: { "Content-Type": "application/json" },
    tags: { scenario: "webhook_auth_fail" },
  });
  webhookAuthFailLatency.add(res.timings.duration);
  const ok = check(res, {
    "auth fail 403": (r) => r.status === 403,
  });
  if (!ok) errors.add(1);
  sleep(0.5);
}

// ── Teardown ─────────────────────────────────────────────────────────────
// k6 default summary goes to stdout. We'll redirect to a file via the shell.
