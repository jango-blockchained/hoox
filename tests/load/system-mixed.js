/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

// Combined System Traffic Load Test
// Simulates realistic mixed traffic across the Hoox system:
// - 70% webhook calls (hoox gateway POST /webhook)
// - 20% D1 queries (d1-worker POST /query)
// - 10% D1 batch operations (d1-worker POST /batch)
//
// This is the most realistic test - it exercises the full data flow
// from public ingress through to database operations.
//
// Usage:
//   k6 run tests/load/system-mixed.js
//   BASE_URL=http://localhost:8787 INTERNAL_AUTH_KEY=secret HOOX_API_KEY=secret k6 run tests/load/system-mixed.js

import { group } from "k6";
import http from "k6/http";
import { check, sleep } from "k6";
import {
  getBaseUrl,
  getAuthHeaders,
  getWebhookPayload,
  getD1BatchPayload,
  getDefaultThresholds,
  url,
} from "./helpers.js";

// ── Traffic Distribution ──────────────────────────────────────────────────
// Each VU picks an endpoint based on these weights.

const TRAFFIC_MIX = [
  { type: "webhook", weight: 0.7 },
  { type: "d1-query", weight: 0.2 },
  { type: "d1-batch", weight: 0.1 },
];

function pickEndpoint() {
  const roll = Math.random();
  let cumulative = 0;
  for (const entry of TRAFFIC_MIX) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry.type;
  }
  return "webhook";
}

// ── Options ───────────────────────────────────────────────────────────────

const thresholds = getDefaultThresholds({
  // Per-endpoint thresholds
  "http_req_duration{name:webhook}": ["p(95)<2000", "p(99)<3000", "avg<500"],
  "http_req_duration{name:d1-query}": ["p(95)<500", "p(99)<1000", "avg<100"],
  "http_req_duration{name:d1-batch}": ["p(95)<800", "p(99)<1500", "avg<200"],
  // Overall system thresholds
  http_req_duration: ["p(95)<2000", "p(99)<3000"],
  http_req_failed: ["rate<0.01"],
});

export const options = {
  stages: [
    { duration: "1m", target: 5 }, // Warm-up
    { duration: "3m", target: 30 }, // Ramp to moderate load
    { duration: "5m", target: 50 }, // Sustained peak
    { duration: "2m", target: 20 }, // Cool down
    { duration: "1m", target: 0 }, // Ramp down
  ],
  thresholds,
};

// ── Setup ─────────────────────────────────────────────────────────────────

export function setup() {
  // Verify hoox gateway is reachable
  const gwRes = http.get(url("/health"));
  check(gwRes, {
    "hoox gateway reachable": (r) => r.status === 200,
  });

  // Verify d1-worker is reachable (assumes same base URL or proxied)
  const d1Res = http.get(url("/health"), {
    headers: getAuthHeaders(),
  });
  check(d1Res, {
    "d1-worker reachable": (r) => r.status === 200,
  });

  const reachable = gwRes.status === 200;
  if (!reachable) {
    console.warn(
      `WARNING: Health checks failed. Make sure workers are running.\n` +
        `  BASE_URL=${getBaseUrl()}\n` +
        `  INTERNAL_AUTH_KEY=${__ENV.INTERNAL_AUTH_KEY || "(using default)"}\n` +
        `  HOOX_API_KEY=${__ENV.HOOX_API_KEY ? "(set)" : "(not set)"}`
    );
  }

  return { started: Date.now() };
}

// ── Endpoint Functions ────────────────────────────────────────────────────

function sendWebhook() {
  const payload = JSON.stringify(
    getWebhookPayload({
      action: Math.random() > 0.5 ? "LONG" : "SHORT",
      symbol: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"][
        Math.floor(Math.random() * 4)
      ],
      quantity: Math.random() * 0.01 + 0.001,
      price: Math.floor(Math.random() * 30000 + 50000),
    })
  );

  const res = http.post(url("/webhook"), payload, {
    headers: { "Content-Type": "application/json" },
    tags: { name: "webhook" },
  });

  check(res, {
    "webhook accepted (2xx)": (r) => r.status >= 200 && r.status < 300,
    "webhook gracefully handled (429)": (r) =>
      r.status === 429 || (r.status >= 200 && r.status < 300),
    "webhook response time OK": (r) => r.timings.duration < 3000,
  });

  // Log rate limiting if it happens
  if (res.status === 429) {
    const retryAfter = res.headers["Retry-After"] || "unknown";
    console.log(`Rate limited. Retry-After: ${retryAfter}s`);
  }
}

function sendD1Query() {
  const queries = [
    {
      query:
        "SELECT id, symbol, action, quantity, price, status, created_at FROM positions ORDER BY created_at DESC LIMIT 10",
      params: [],
    },
    {
      query:
        "SELECT COUNT(*) as count, AVG(quantity) as avg_qty FROM trades WHERE created_at > datetime('now', '-24 hours')",
      params: [],
    },
    {
      query:
        "SELECT symbol, SUM(pnl) as pnl FROM trades WHERE created_at > datetime('now', '-7 days') GROUP BY symbol ORDER BY pnl DESC",
      params: [],
    },
    {
      query: "SELECT * FROM signals ORDER BY created_at DESC LIMIT 5",
      params: [],
    },
  ];

  const query = queries[Math.floor(Math.random() * queries.length)];
  const payload = JSON.stringify(query);

  const res = http.post(url("/query"), payload, {
    headers: getAuthHeaders(),
    tags: { name: "d1-query" },
  });

  check(res, {
    "d1 query returns 200": (r) => r.status === 200,
    "d1 query is fast": (r) => r.timings.duration < 1000,
  });
}

function sendD1Batch() {
  const payload = JSON.stringify(
    getD1BatchPayload({
      statements: [
        {
          query:
            "SELECT COUNT(*) as open_positions FROM positions WHERE status = 'open'",
          params: [],
        },
        {
          query:
            "SELECT COALESCE(SUM(pnl), 0) as daily_pnl FROM trades WHERE created_at > datetime('now', '-24 hours')",
          params: [],
        },
        {
          query:
            "SELECT COUNT(*) as todays_trades FROM trades WHERE created_at > datetime('now', '-24 hours')",
          params: [],
        },
      ],
    })
  );

  const res = http.post(url("/batch"), payload, {
    headers: getAuthHeaders(),
    tags: { name: "d1-batch" },
  });

  check(res, {
    "d1 batch returns 200": (r) => r.status === 200,
    "d1 batch is fast enough": (r) => r.timings.duration < 1500,
  });
}

// ── Main Load Test ────────────────────────────────────────────────────────

export default function () {
  const endpoint = pickEndpoint();

  group(`Traffic: ${endpoint}`, function () {
    switch (endpoint) {
      case "webhook":
        sendWebhook();
        break;
      case "d1-query":
        sendD1Query();
        break;
      case "d1-batch":
        sendD1Batch();
        break;
    }
  });

  // Realistic pacing between requests (varies by endpoint type)
  const thinkTime = endpoint === "webhook" ? 1.0 : 0.3;
  sleep(thinkTime);
}

// ── Teardown ──────────────────────────────────────────────────────────────

export function teardown(data) {
  const duration = Date.now() - data.started;
  console.log(
    `System mixed test completed. Duration: ${Math.round(duration / 1000)}s`
  );
}
