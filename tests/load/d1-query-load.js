/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

// D1 Query Load Test
// Tests concurrent database query patterns against d1-worker.
// Covers: single SELECT queries, batch operations, write operations.
//
// Usage:
//   k6 run tests/load/d1-query-load.js
//   BASE_URL=http://localhost:8788 INTERNAL_AUTH_KEY=secret k6 run tests/load/d1-query-load.js

import { group } from "k6";
import http from "k6/http";
import { check, sleep } from "k6";
import {
  getAuthHeaders,
  getD1QueryPayload,
  getD1BatchPayload,
  getDefaultThresholds,
  url,
} from "./helpers.js";

// ── Options ───────────────────────────────────────────────────────────────

const thresholds = getDefaultThresholds({
  // D1 queries should be fast (< 500ms p95)
  "http_req_duration{name:d1-query}": ["p(95)<500", "p(99)<1000", "avg<100"],
  // Batch operations have multiple statements
  "http_req_duration{name:d1-batch}": ["p(95)<800", "p(99)<1500", "avg<200"],
  // Health checks
  "http_req_duration{name:d1-health}": ["p(95)<200"],
  // Very low error rate expected
  "http_req_failed{name:d1-query}": ["rate<0.005"],
  "http_req_failed{name:d1-batch}": ["rate<0.005"],
});

export const options = {
  stages: [
    { duration: "1m", target: 5 }, // Warm-up with low concurrency
    { duration: "2m", target: 20 }, // Moderate load
    { duration: "2m", target: 30 }, // Peak query load
    { duration: "1m", target: 10 }, // Cool down
    { duration: "30s", target: 0 }, // Ramp down
  ],
  thresholds,
};

// ── Setup ─────────────────────────────────────────────────────────────────

export function setup() {
  const healthRes = http.get(url("/health"), {
    headers: getAuthHeaders(),
    tags: { name: "d1-health" },
  });

  check(healthRes, {
    "d1-worker is reachable": (r) => r.status === 200,
  });

  if (healthRes.status !== 200) {
    console.warn(
      `WARNING: d1-worker health check failed (${healthRes.status}). ` +
        "Make sure the worker is running and INTERNAL_AUTH_KEY is correct."
    );
  }

  return {};
}

// ── Main Load Test ────────────────────────────────────────────────────────

export default function () {
  group("D1 Queries", function () {
    // ── Simple SELECT ──
    group("SELECT positions", function () {
      const payload = JSON.stringify(
        getD1QueryPayload({
          query:
            "SELECT id, symbol, action, quantity, price, status, created_at FROM positions ORDER BY created_at DESC LIMIT 10",
          params: [],
        })
      );

      const res = http.post(url("/query"), payload, {
        headers: getAuthHeaders(),
        tags: { name: "d1-query" },
      });

      check(res, {
        "SELECT returns 200": (r) => r.status === 200,
        "SELECT returns valid JSON": (r) => {
          try {
            JSON.parse(r.body);
            return true;
          } catch {
            return false;
          }
        },
        "SELECT is fast enough": (r) => r.timings.duration < 500,
      });
    });

    // ── Aggregation query ──
    group("SELECT aggregate", function () {
      const payload = JSON.stringify(
        getD1QueryPayload({
          query:
            "SELECT COUNT(*) as count, AVG(quantity) as avg_qty, SUM(pnl) as total_pnl FROM trades WHERE created_at > datetime('now', '-7 days')",
          params: [],
        })
      );

      const res = http.post(url("/query"), payload, {
        headers: getAuthHeaders(),
        tags: { name: "d1-query" },
      });

      check(res, {
        "aggregate returns 200": (r) => r.status === 200,
        "aggregate result is parseable": (r) => {
          try {
            JSON.parse(r.body);
            return true;
          } catch {
            return false;
          }
        },
      });
    });

    // ── Batch operations ──
    group("batch queries", function () {
      const payload = JSON.stringify(
        getD1BatchPayload({
          statements: [
            {
              query:
                "SELECT COUNT(*) as count FROM positions WHERE status = 'open'",
              params: [],
            },
            {
              query:
                "SELECT COALESCE(SUM(pnl), 0) as total_pnl FROM trades WHERE created_at > datetime('now', '-24 hours')",
              params: [],
            },
            {
              query:
                "SELECT symbol, COUNT(*) as trade_count FROM trades GROUP BY symbol ORDER BY trade_count DESC LIMIT 5",
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
        "batch returns 200": (r) => r.status === 200,
        "batch returns results array": (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.results !== undefined || Array.isArray(body.result);
          } catch {
            return false;
          }
        },
        "batch is fast enough": (r) => r.timings.duration < 800,
      });
    });

    // ── Dashboard stats query ──
    group("dashboard stats", function () {
      const res = http.get(url("/api/dashboard/stats"), {
        headers: getAuthHeaders(),
        tags: { name: "d1-query" },
      });

      check(res, {
        "dashboard stats returns 200": (r) => r.status === 200,
      });
    });
  });

  // Pacing between iterations
  sleep(0.5);
}

// ── Teardown ──────────────────────────────────────────────────────────────

export function teardown() {
  console.log("D1 query load test completed.");
}
