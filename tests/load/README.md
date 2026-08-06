# k6 Performance & Load Tests

Load testing suite for Hoox Cloudflare Workers using [k6](https://k6.io/).

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/) installed locally
  - macOS: `brew install k6`
  - Linux: `sudo apt install k6` or download from [releases](https://github.com/grafana/k6/releases)
  - Docker: `docker run --rm -i grafana/k6 run - <script.js`
- Target workers running locally via `wrangler dev` or deployed to preview

## Quick Start

```bash
# 1. Start the hoox gateway locally (in another terminal)
cd workers/hoox
bunx wrangler dev src/index.ts

# 2. In another terminal, start d1-worker
cd workers/d1-worker
bunx wrangler dev src/index.ts --port 8788

# 3. Run all load tests (from repo root)
k6 run tests/load/webhook-flow.js
k6 run tests/load/d1-query-load.js
k6 run tests/load/agent-cron-sim.js
k6 run tests/load/system-mixed.js
```

## Test Scripts

| Script                                   | Target       | Endpoint                                | Priority | Description                                                 |
| ---------------------------------------- | ------------ | --------------------------------------- | -------- | ----------------------------------------------------------- |
| [`webhook-flow.js`](webhook-flow.js)     | hoox gateway | `POST /webhook`                         | P0       | Simulates TradingView alert flow through the public gateway |
| [`d1-query-load.js`](d1-query-load.js)   | d1-worker    | `POST /query`, `POST /batch`            | P1       | Concurrent database query patterns                          |
| [`agent-cron-sim.js`](agent-cron-sim.js) | agent-worker | `GET /agent/status`, `POST /agent/chat` | P2       | Simulates the agent cron loop (configurable 1–1440 min)     |
| [`system-mixed.js`](system-mixed.js)     | All          | Mixed                                   | P2       | Combined realistic traffic distribution                     |

## Environment Variables

| Variable              | Default                 | Required | Description                                               |
| --------------------- | ----------------------- | -------- | --------------------------------------------------------- |
| `BASE_URL`            | `http://localhost:8787` | No       | Target base URL for load tests                            |
| `INTERNAL_AUTH_KEY`   | `local_dev_key`         | No       | `X-Internal-Auth-Key` header value for internal endpoints |
| `HOOX_API_KEY`        | `test_webhook_api_key`  | No       | API key sent in webhook body for hoox auth                |
| `THRESHOLD_P95`       | `2000`                  | No       | p95 latency threshold in milliseconds                     |
| `THRESHOLD_P99`       | `5000`                  | No       | p99 latency threshold in milliseconds                     |
| `THRESHOLD_FAIL_RATE` | `0.01`                  | No       | Maximum acceptable error rate (0.01 = 1%)                 |

### Run Modes

**Local (wrangler dev):**

```bash
# Default targets localhost:8787
k6 run tests/load/webhook-flow.js
```

**Preview deployment:**

```bash
BASE_URL=https://hoox-preview.cryptolinx.workers.dev \
  INTERNAL_AUTH_KEY=your_internal_key \
  HOOX_API_KEY=your_webhook_key \
  k6 run tests/load/webhook-flow.js
```

**Production (use with caution):**

```bash
BASE_URL=https://hoox.cryptolinx.workers.dev \
  INTERNAL_AUTH_KEY=$INTERNAL_KEY_BINDING \
  HOOX_API_KEY=$WEBHOOK_API_KEY_BINDING \
  k6 run tests/load/webhook-flow.js
```

## Thresholds

Thresholds define pass/fail criteria for each test. They are **informational by default** (failures don't block CI), but provide a signal for performance regressions.

| Metric                    | Default    | Description                   |
| ------------------------- | ---------- | ----------------------------- |
| `http_req_duration p(95)` | `< 2000ms` | 95th percentile response time |
| `http_req_duration p(99)` | `< 5000ms` | 99th percentile response time |
| `http_req_failed`         | `< 1%`     | Maximum error rate            |

### Per-Endpoint Thresholds

| Endpoint                         | Expected p95 | Notes                                   |
| -------------------------------- | ------------ | --------------------------------------- |
| hoox `POST /webhook`             | `< 2000ms`   | Includes internal service binding calls |
| d1-worker `POST /query`          | `< 500ms`    | Direct D1 SQLite query                  |
| d1-worker `POST /batch`          | `< 800ms`    | Multi-query transaction                 |
| agent-worker `GET /agent/status` | `< 1000ms`   | KV read operation                       |
| agent-worker `POST /agent/chat`  | `< 5000ms`   | AI inference endpoint                   |
| `GET /health` (any)              | `< 200ms`    | Simple health probe                     |

## CI Integration

Load tests run nightly via `.github/workflows/load-test.yml`. They can also be triggered manually via `workflow_dispatch` with custom environment variables.

```yaml
# Trigger manually with:
#   gh workflow run load-test.yml -f BASE_URL=https://preview.workers.dev
```

Threshold failures are **informational** (`continue-on-error: true`) and will not block PRs. Load test JSON reports are archived as CI artifacts for post-run analysis.

## Interpreting Results

k6 outputs summary statistics per test:

```
    http_req_duration..........: avg=245ms   min=12ms   med=180ms   max=3450ms   p(90)=520ms    p(95)=890ms
    http_req_failed............: 0.00%   ✓ 1423   ✗ 0
```

- **avg/med** — Typical response time
- **p(90)/p(95)** — Tail latency (focus on p95 for SLA)
- **max** — Worst case (watch for outliers)
- **http_req_failed** — Error rate (should be < 1%)

## Troubleshooting

### "Failed to connect to localhost:8787"

→ Make sure `wrangler dev` is running for the target worker.
→ Check port: worker may be on a different port if multiple are running.

### "401 Unauthorized" on internal endpoints

→ Set `INTERNAL_AUTH_KEY` to match the worker's `INTERNAL_KEY_BINDING` secret.

### "429 Too Many Requests"

→ hoox gateway rate-limits at 10 trades/minute/session. The test handles this gracefully, but thresholds may show higher p95 if rate-limited consistently. Either reduce VU count or adjust the rate limit for testing.

### "Cannot find module 'k6'"

→ These scripts require k6 to run, not Node.js/Bun.
→ Run with `k6 run script.js`, never `node script.js`.

### k6 not found

→ Install k6: https://k6.io/docs/getting-started/installation/
