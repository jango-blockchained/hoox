/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

// Webhook Flow Load Test
// Simulates TradingView alert flow through the hoox public gateway (POST /webhook).
// Tests end-to-end: auth (API key), payload validation, rate limiting, internal forwarding.
//
// Usage:
//   k6 run tests/load/webhook-flow.js
//   BASE_URL=https://hoox.preview.workers.dev HOOX_API_KEY=secret k6 run tests/load/webhook-flow.js

import { group } from "k6";
import http from "k6/http";
import { check, sleep } from "k6";
import { getWebhookPayload, getDefaultThresholds, url } from "./helpers.js";

// ── Options ───────────────────────────────────────────────────────────────

const thresholds = getDefaultThresholds({
  // Stricter thresholds for the critical webhook path
  "http_req_duration{name:webhook-flow}": [
    "p(95)<2000",
    "p(99)<3000",
    "avg<500",
  ],
  "http_req_failed{name:webhook-flow}": ["rate<0.01"],
  // Health checks should be fast
  "http_req_duration{name:health-check}": ["p(95)<200", "avg<50"],
});

export const options = {
  // Realistic load: ramp up to 50 concurrent users
  stages: [
    { duration: "2m", target: 10 }, // Warm-up
    { duration: "1m", target: 25 }, // Ramp to moderate load
    { duration: "3m", target: 50 }, // Peak load
    { duration: "1m", target: 25 }, // Cool down
    { duration: "30s", target: 0 }, // Ramp down
  ],
  thresholds,
  // Don't fail the whole test on individual request errors
  noConnectionReuse: false,
};

// ── Setup ─────────────────────────────────────────────────────────────────

export function setup() {
  // Verify the target is reachable before starting the load test
  const healthRes = http.get(url("/health"));
  check(healthRes, {
    "target is reachable": (r) => r.status === 200,
  });

  if (healthRes.status !== 200) {
    console.warn(
      `WARNING: Health check failed (${healthRes.status}). ` +
        "Make sure the target worker is running.\n" +
        `  Expected: http://localhost:8787/health to return 200\n` +
        `  Actual: ${url("/health")} returned ${healthRes.status}\n` +
        "  Override with: BASE_URL=<url> k6 run ..."
    );
  }

  return {};
}

// ── Main Load Test ────────────────────────────────────────────────────────

export default function () {
  group("Webhook Flow", function () {
    // ── Successful trade signal (LONG) ──
    group("submit LONG signal", function () {
      const payload = JSON.stringify(
        getWebhookPayload({
          action: "LONG",
          symbol: "BTCUSDT",
          quantity: 0.002,
          price: 67450,
        })
      );

      const res = http.post(url("/webhook"), payload, {
        headers: { "Content-Type": "application/json" },
        tags: { name: "webhook-flow" },
      });

      check(res, {
        "webhook accepted (200)": (r) => r.status === 200,
        "webhook accepted (202)": (r) => r.status === 202,
        "response has success field": (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.success === true;
          } catch {
            return false;
          }
        },
      });
    });

    // ── Short trade signal ──
    group("submit SHORT signal", function () {
      const payload = JSON.stringify(
        getWebhookPayload({
          action: "SHORT",
          symbol: "ETHUSDT",
          quantity: 0.05,
          price: 3450,
          leverage: 5,
        })
      );

      const res = http.post(url("/webhook"), payload, {
        headers: { "Content-Type": "application/json" },
        tags: { name: "webhook-flow" },
      });

      check(res, {
        "short signal accepted": (r) => r.status === 200 || r.status === 202,
      });
    });

    // ── Rate limit test (rapid fire) ──
    group("rate limit behavior", function () {
      // Send rapid requests to trigger the 10/min/session rate limiter
      for (let i = 0; i < 3; i++) {
        const payload = JSON.stringify(
          getWebhookPayload({
            action: "LONG",
            symbol: "SOLUSDT",
            quantity: 1,
            price: 145,
          })
        );

        const res = http.post(url("/webhook"), payload, {
          headers: { "Content-Type": "application/json" },
          tags: { name: "webhook-flow" },
        });

        // Rate-limited requests (429) are expected and should be handled gracefully
        if (res.status === 429) {
          check(res, {
            "rate limit returns retry-after": (r) =>
              r.headers["Retry-After"] !== undefined,
          });
        }
      }
    });

    // ── Invalid payload (should fail validation gracefully) ──
    group("invalid payload handling", function () {
      const payload = JSON.stringify({
        apiKey: "invalid",
        action: "INVALID",
        // Missing required fields
      });

      const res = http.post(url("/webhook"), payload, {
        headers: { "Content-Type": "application/json" },
        tags: { name: "webhook-flow" },
      });

      check(res, {
        "invalid payload returns 4xx": (r) => r.status >= 400 && r.status < 500,
      });
    });
  });

  // Small pause between iterations for realistic pacing
  sleep(1);
}

// ── Teardown ──────────────────────────────────────────────────────────────

export function teardown() {
  // Log final stats
  console.log("Webhook flow test completed.");
}
