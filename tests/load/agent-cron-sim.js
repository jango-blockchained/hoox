/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

// Agent Worker Cron Loop Simulation
// Simulates agent-worker's 5-minute cron cycle:
// - Checks open positions
// - Fetches account balances
// - Verifies AI model health
// - Optionally runs risk queries
//
// This is a periodic workload pattern (not sustained high concurrency).
//
// Usage:
//   k6 run tests/load/agent-cron-sim.js
//   BASE_URL=http://localhost:8789 INTERNAL_AUTH_KEY=secret k6 run tests/load/agent-cron-sim.js

import { group } from "k6";
import http from "k6/http";
import { check } from "k6";
import { getAuthHeaders, getDefaultThresholds, url } from "./helpers.js";

// ── Options ───────────────────────────────────────────────────────────────

const thresholds = getDefaultThresholds({
  // Agent endpoints include AI calls which can be slow
  "http_req_duration{name:agent-status}": ["p(95)<1000", "p(99)<2000"],
  "http_req_duration{name:agent-health}": ["p(95)<200"],
  "http_req_duration{name:agent-config}": ["p(95)<500"],
  // AI endpoints may have high latency
  "http_req_duration{name:agent-chat}": ["p(95)<5000", "p(99)<10000"],
  http_req_failed: ["rate<0.02"],
});

export const options = {
  // Agent runs on a cron schedule, so we simulate periodic bursts
  // rather than sustained load. This uses constant-arrival-rate to
  // simulate scheduled cron invocations.
  scenarios: {
    // Main cron simulation: fires every ~60s per VU (simulating 5-min cycle compressed)
    agent_cron: {
      executor: "constant-arrival-rate",
      rate: 1, // 1 iteration per time unit
      timeUnit: "60s", // every 60 seconds (compressed from 5 min)
      duration: "10m", // run for 10 minutes = ~10 cycles
      preAllocatedVUs: 2,
      maxVUs: 5,
      tags: { scenario: "agent-cron" },
    },
    // Health check probes (separate, higher frequency)
    health_probes: {
      executor: "constant-arrival-rate",
      rate: 1,
      timeUnit: "30s", // health check every 30 seconds
      duration: "10m",
      preAllocatedVUs: 1,
      maxVUs: 2,
      tags: { scenario: "health-probes" },
    },
  },
  thresholds,
};

// ── Setup ─────────────────────────────────────────────────────────────────

export function setup() {
  const healthRes = http.get(url("/health"), {
    headers: getAuthHeaders(),
    tags: { name: "agent-health" },
  });

  check(healthRes, {
    "agent-worker is reachable": (r) => r.status === 200,
  });

  if (healthRes.status !== 200) {
    console.warn(
      `WARNING: agent-worker health check failed (${healthRes.status}). ` +
        "Make sure the worker is running and INTERNAL_AUTH_KEY is correct."
    );
  }

  return {};
}

// ── Main: Cron Cycle Simulation ──────────────────────────────────────────

export function agent_cron() {
  group("Agent Cron Cycle", function () {
    // ── Step 1: Health check ──
    group("health check", function () {
      const res = http.get(url("/health"), {
        headers: getAuthHeaders(),
        tags: { name: "agent-health" },
      });

      check(res, {
        "agent health returns 200": (r) => r.status === 200,
      });
    });

    // ── Step 2: Check active positions & agent status ──
    group("check positions", function () {
      const res = http.get(url("/agent/status"), {
        headers: getAuthHeaders(),
        tags: { name: "agent-status" },
      });

      check(res, {
        "agent status returns 200": (r) => r.status === 200,
        "agent status has valid JSON": (r) => {
          try {
            JSON.parse(r.body);
            return true;
          } catch {
            return false;
          }
        },
      });
    });

    // ── Step 3: Fetch agent config ──
    group("fetch config", function () {
      const res = http.get(url("/agent/config"), {
        headers: getAuthHeaders(),
        tags: { name: "agent-config" },
      });

      check(res, {
        "agent config returns 200": (r) => r.status === 200,
      });
    });

    // ── Step 4: Optional risk query (50% of cycles) ──
    if (__ITER % 2 === 0) {
      group("risk query", function () {
        const payload = JSON.stringify({
          prompt:
            "What is the current max drawdown and should I reduce position sizes?",
          temperature: 0.3,
          maxTokens: 200,
        });

        const res = http.post(url("/agent/chat"), payload, {
          headers: getAuthHeaders(),
          tags: { name: "agent-chat" },
        });

        check(res, {
          "risk query returns 200": (r) => r.status === 200,
        });
      });
    }

    // ── Step 5: Model health check ──
    group("model health", function () {
      const res = http.get(url("/agent/health"), {
        headers: getAuthHeaders(),
        tags: { name: "agent-health" },
      });

      check(res, {
        "model health returns 200": (r) => r.status === 200,
        "models responding": (r) => {
          try {
            JSON.parse(r.body);
            return true;
          } catch {
            return false;
          }
        },
      });
    });
  });
}

// ── Health Probe Scenario (separate exec function) ────────────────────────

export function health_probes() {
  // Quick health probe - just ping the health endpoint
  const res = http.get(url("/health"), {
    headers: getAuthHeaders(),
    tags: { name: "agent-health" },
  });

  check(res, {
    "health probe returns 200": (r) => r.status === 200,
  });
}

// Default export for non-scenario runs (backward compat)
export default function () {
  agent_cron();
}
