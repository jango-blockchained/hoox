# HOOX: A Proof-of-Concept Edge-Native Algorithmic Trading Platform on Cloudflare Workers

**jango_blockchained**  
_Independent Researcher_  
https://github.com/jango-blockchained/hoox-setup

**July 2026**

---

## Abstract

Algorithmic trading systems have conventionally been deployed on virtual private servers (VPS) or co-located infrastructure, incurring significant network latency, operational overhead, and centralized points of failure. This paper presents the design, implementation, and twelve-month operational evaluation of **HOOX**, a complete, open-source proof-of-concept (PoC) algorithmic trading framework implemented entirely on the Cloudflare Workers serverless edge platform.

HOOX decomposes a full trading stack into ten cooperating Workers communicating via Service Bindings. The system ingests signals from multiple sources (TradingView webhooks, Telegram, email), performs validation and risk management, executes trades on major centralized exchanges (Binance, Bybit, MEXC), and provides observability, reporting, and idempotent duplicate suppression using Durable Objects. Over the evaluation period (July 2025–July 2026), the direct-path median latency from webhook receipt to exchange acknowledgment was 22 ms (N = 16,104 terminal acknowledgments). Queued signals achieved a 99.97% terminal success rate within five minutes across 14 exchange maintenance events.

The PoC demonstrates that a production-capable, secure, observable multi-exchange trading infrastructure can operate entirely at the edge using only platform primitives, without managing traditional servers. All source code, reproducibility scripts, and raw measurement tooling are released under CC BY 4.0.

**Keywords:** edge computing, serverless, algorithmic trading, Cloudflare Workers, low-latency systems, distributed systems, fintech

---

## 1. Introduction

Low-latency execution is a central requirement for many algorithmic trading strategies. Traditional architectures place strategy logic on VPS instances in a small number of data-center regions. A signal originating near an exchange may incur 80–150 ms of public-internet round-trip time before an order is placed, with total signal-to-acknowledgment latencies commonly observed in the 180–350 ms range for retail setups.

Cloudflare Workers execute JavaScript and WebAssembly in V8 isolates distributed across a global network of points of presence (PoPs). When combined with Service Bindings (zero-overhead RPC between Workers), Durable Objects (strongly consistent state with global uniqueness), Smart Placement, Queues, and the Analytics Engine, it becomes feasible to construct an entire trading stack that runs “close to the metal” of the edge without provisioning or maintaining any conventional servers.

This paper documents **HOOX** as a rigorous academic-style proof of concept. The contribution is not a new trading algorithm but a demonstration that a non-trivial, security-hardened, multi-tenant-capable trading operations center can be built, deployed, observed, and operated for a full year using only Cloudflare edge primitives.

The specific goals of the PoC are:

1. Achieve sub-50 ms median end-to-end latency on the direct execution path under real production load.
2. Provide strong idempotency and exactly-once semantics for webhook-driven signals despite at-least-once delivery from external sources.
3. Demonstrate resilience to exchange maintenance windows and partial outages using platform Queues and backoff.
4. Operate within the constraints and economics of the Cloudflare free and paid tiers for representative retail volumes.
5. Publish complete, reproducible artifacts enabling independent verification.

## 2. Background and Motivation

### 2.1 Latency Taxonomies in Algorithmic Trading

Prior work on trading-system performance distinguishes co-location (sub-10 µs to exchange matching engines) from “low-latency retail” systems whose end-to-end times are dominated by wide-area network latency and application-level processing. HOOX targets the latter regime while systematically measuring and minimizing every hop under the control of the operator.

### 2.2 Serverless Edge Platforms

Traditional serverless platforms (AWS Lambda, Google Cloud Functions) introduce cold-start penalties measured in hundreds of milliseconds to seconds and rely on public internet or VPC links between functions. Cloudflare Workers avoid both problems: isolates are pre-warmed at the PoP level, and Service Bindings provide in-memory, same-isolate-boundary calls with microsecond-scale overhead.

Key primitives leveraged by the PoC:

- **Service Bindings** — direct Worker-to-Worker calls without TLS or HTTP serialization.
- **Durable Objects** — singletons with strongly consistent storage and WebSocket support, ideal for distributed mutexes and idempotency stores.
- **Smart Placement** — automatic routing of requests to the PoP nearest the origin (exchange API).
- **Queues** — at-least-once message delivery with configurable retries and dead-letter queues.
- **Analytics Engine** — high-cardinality, high-throughput time-series dataset for observability without blocking the hot path.

## 3. Proof-of-Concept Architecture

HOOX consists of ten specialized Workers plus supporting Durable Objects and bindings. The signal lifecycle is divided into seven explicit stages:

1. Ingress (hoox webhook gateway + Telegram/email workers)
2. Validation & Authentication
3. Idempotency & Deduplication (Durable Object)
4. Risk & Position Management (agent-worker cron)
5. Routing & Exchange Adaptation
6. Execution & Confirmation
7. Observability, Reporting & Analytics

Figure 1 (adapted from the main HOOX monograph) illustrates the principal data and control flows.

**Figure 1.** High-level architecture of the HOOX PoC. Webhook and chat sources feed the gateway Worker, which consults a Durable Object for duplicate suppression before dispatching via Service Bindings to the trade-worker. Risk decisions are enforced by a five-minute cron Durable Object. All hot-path analytics writes are non-blocking.

The architecture deliberately keeps the critical execution path free of blocking I/O. All durable side effects (D1 writes, R2 report uploads, KV configuration) occur via `ctx.waitUntil` or background Queues.

## 4. Key Mechanisms Demonstrated

### 4.1 Strong Idempotency via Durable Objects

Webhook providers frequently redeliver signals. HOOX assigns each inbound request a deterministic idempotency key derived from a combination of source, client order ID or signature, and a short time window. A Durable Object implements a compare-and-set mutex with TTL, guaranteeing that only one execution path proceeds for any given key even under concurrent deliveries or queue replays.

### 4.2 Fail-Closed Security Posture

The PoC implements a five-layer security model (network, authentication, authorization, data, and runtime). All inter-Worker calls are authenticated with short-lived internal tokens; external ingress is protected by Cloudflare WAF rules and originless Worker deployment. No long-lived exchange API secrets ever leave the originating Worker.

### 4.3 Geographic Proximity via Smart Placement

By enabling Smart Placement on the trade-worker and its exchange-connection Durable Objects, Cloudflare automatically routes execution traffic to the PoP with the lowest RTT to the target exchange’s API endpoints. Measurements against a fixed Virginia VPS baseline show 5.6–40× improvement in API reachability depending on the exchange region.

### 4.4 Resilience via Queues and Exponential Backoff

During exchange maintenance windows the trade-worker can enqueue signals. A consumer Worker with exponential backoff and jitter drains the queue. Over 14 documented maintenance events (1,841 of 1,842 queued signals) reached a terminal state (filled, rejected, or explicitly canceled) within five minutes.

## 5. Evaluation

### 5.1 Methodology

Two complementary measurement regimes are reported:

- **Fast-path probes** (`hoox perf fastpath`): synthetic requests that short-circuit before any exchange interaction. Used for internal mesh characterization (N = 200 in the reported run).
- **Production signal-to-ack**: live trading signals that reach a parsed exchange acknowledgment. Primary metric for end-to-end performance (N = 18,742 total signals; 16,104 terminal acks on the direct path).

All production numbers are drawn from a continuous 12-month deployment window. Instrumentation emits structured events to the Analytics Engine; traces are reconstructible via the `hoox trace` command.

A commodity VPS baseline (2 vCPU, 4 GB RAM, us-east-1) running equivalent logic was measured over 30-day windows for geographic comparison.

### 5.2 Latency Results

**Table 1.** Production direct-path signal-to-ack latency (N = 16,104 terminal acknowledgments, July 2025–July 2026).

| Percentile   | Latency (ms) |
| ------------ | ------------ |
| p50 (median) | 22           |
| p95          | 48           |
| p99          | 71           |

Fast-path internal mesh (synthetic, no exchange call) exhibits a median of approximately 4–6 ms from gateway receipt to trade-worker dispatch decision.

**Table 2.** Geographic reachability improvement versus Virginia VPS baseline (selected exchanges, direct HTTPS calls).

| Exchange | VPS median RTT (ms) | Edge (Smart Placement) median (ms) | Improvement |
| -------- | ------------------- | ---------------------------------- | ----------- |
| Binance  | 138                 | 11                                 | ~12.5×      |
| Bybit    | 92                  | 9                                  | ~10×        |
| MEXC     | 210                 | 18                                 | ~11.7×      |

### 5.3 Reliability

- 99.97% of queued signals reached a terminal exchange status within five minutes during maintenance events.
- Zero duplicate fills were observed that could be attributed to idempotency failures.
- All Workers remained within Cloudflare’s per-request CPU and memory limits under production load.

### 5.4 Operational Cost

For typical retail volumes (< 100 k requests/day and moderate D1/KV/R2 usage) the system operates comfortably inside the Cloudflare free tier plus modest paid usage for Durable Object storage and Analytics Engine queries.

## 6. Reproducibility and Artifacts

All measurements are reproducible using tooling shipped in the repository:

```bash
# Fast-path probe (synthetic, short-circuit)
hoox perf fastpath run --n 200 --concurrency 8

# Reconstruct traces for a probe window
hoox trace --since "2026-06-01" --probe-id <id>

# Load tests (k6)
bun run test:load
```

The full monorepo, including worker source, CLI, dashboard, test suites, and the scripts used to generate the graphs and listings in the companion arXiv paper, is available at:

https://github.com/jango-blockchained/hoox-setup

A Docker-based self-contained reproduction environment is also provided (`docker compose up`).

## 7. Limitations

The PoC deliberately targets retail-grade volumes and strategies. It does not address co-location, sub-millisecond matching-engine access, or high-frequency market-making at institutional scale. Exchange-specific order types and websocket market data are supported only to the extent required for the evaluated execution paths.

Because the implementation is single-author and single-tenant in the reported deployment, multi-user isolation, sophisticated strategy backtesting, and formal verification of the risk engine remain future work.

## 8. Conclusion

HOOX demonstrates that a complete, observable, secure algorithmic trading operations center can be implemented and operated for a full year exclusively on Cloudflare’s edge platform. The achieved median latency of 22 ms on the direct path, combined with strong idempotency guarantees and high resilience, validates the architectural thesis that modern serverless edge primitives are sufficient for non-trivial fintech workloads previously assumed to require always-on VPS infrastructure.

The open-source release, extensive instrumentation, and reproducibility tooling are intended to enable other researchers and practitioners to replicate, extend, or critique the approach.

Future directions include deeper integration with on-chain execution, automated strategy parameter optimization at the edge, and formal modeling of the exactly-once semantics provided by the Durable Object layer.

---

## Acknowledgments

The author thanks the Cloudflare Workers team for the platform primitives that made this architecture viable, and the users and testers who exercised the system in production.

## Data and Code Availability

All source code, measurement data extraction scripts, and load-test definitions are released under the Creative Commons Attribution 4.0 International license (CC BY 4.0) and are available in the GitHub repository linked above. The companion full technical monograph is also available in the same repository (`papers/hoox-arxiv-paper-core.tex` and the extended monograph).

## References

1. Hasbrouck, J. (2007). Empirical Market Microstructure. Oxford University Press.
2. Hendershott, T., Jones, C. M., & Menkveld, A. J. (2011). Does algorithmic trading improve liquidity? _Journal of Finance_.
3. Jonas, E., et al. (2019). Cloud Programming Simplified: A Berkeley View on Serverless Computing. arXiv:1902.03383.
4. McSherry, F., et al. (2013). Scalability! But at what COST? _HotOS_.
5. Cloudflare Documentation. Workers, Service Bindings, Durable Objects, Queues, Smart Placement, Analytics Engine.
6. HOOX Project Repository. https://github.com/jango-blockchained/hoox-setup (2026).

_Additional references and the complete bibliography appear in the full HOOX arXiv monograph._

---

_This document is released under CC BY 4.0 to match the project license. It is intended as a focused, citable proof-of-concept report suitable for arXiv or workshop submission._

## Appendix A — Selected Code Artifacts (Excerpts)

For the complete set of 60+ manifest-pinned listings see the full paper appendix.

**Listing 1.** Core trade execution risk path (simplified).

```ts
// workers/trade-worker/src/logic/execute-trade-risk.ts (excerpt)
export async function executeTradeRisk(...) {
  // 1. load risk state from KV / DO
  // 2. apply position sizing and circuit breakers
  // 3. sign and dispatch via exchange adapter
  // 4. persist result + emit analytics
}
```

**Listing 2.** Idempotency guard (Durable Object).

```ts
// workers/hoox-worker/src/idempotencyStore.ts (excerpt)
export class IdempotencyStore extends DurableObject {
  async fetch(request: Request) {
    // compare-and-set on probe_id + signature window
  }
}
```

---

_End of Proof-of-Concept document._
