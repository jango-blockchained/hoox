/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure /health benchmark — no KV writes, just cold + warm latency on the new code.
// 1 VU cold (10s) + 10 VU warm (30s)

import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "https://hoox.cryptolinx.workers.dev";

export const options = {
  scenarios: {
    cold: {
      executor: "constant-vus",
      vus: 1,
      duration: "10s",
      exec: "cold",
      tags: { phase: "cold" },
    },
    warm: {
      executor: "constant-vus",
      vus: 10,
      duration: "30s",
      startTime: "12s",
      exec: "warm",
      tags: { phase: "warm" },
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
  },
};

export function cold() {
  const res = http.get(`${BASE}/health`, { tags: { phase: "cold" } });
  check(res, { 200: (r) => r.status === 200 });
}

export function warm() {
  const res = http.get(`${BASE}/health`, { tags: { phase: "warm" } });
  check(res, { 200: (r) => r.status === 200 });
}
