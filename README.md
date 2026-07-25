# HOOX · Gateway

**The outermost perimeter — validates, routes, deduplicates. The first V8 isolate every external signal touches.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Runtime](https://img.shields.io/badge/Runtime-Bun-black?logo=bun)](https://bun.sh) [![Platform](https://img.shields.io/badge/Platform-Cloudflare%C2%AE%20Workers-orange?logo=cloudflare)](https://workers.cloudflare.com/) [![License](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

**Part of the [HOOX](https://github.com/jango-blockchained/hoox) edge-trading mesh — a production-grade algorithmic trading framework on Cloudflare Workers.**  
**Site:** [hoox.sh](https://hoox.sh) · **Docs:** [docs.hoox.sh](https://docs.hoox.sh) · **Paper:** [`hoox-arxiv-paper-core.pdf`](https://github.com/jango-blockchained/hoox/blob/main/papers/hoox-arxiv-paper-core.pdf)

---

The gateway is the single public ingress point for the entire HOOX mesh. Every external trading signal — whether fired from a TradingView webhook, a Pine Script strategy, a REST client, or an external system — enters through this isolate. It multiplexes authentication (API key validation, IP allow-listing), rate enforcement (token-bucket per tenant), payload schema conformance, and idempotency gating before fanning out to execution.

Idempotency is enforced via Durable Objects: each signal carries an `idempotency_key`; duplicate keys are silently dropped within a configurable window. Signals that pass validation enter the `trade-execution` queue — the async pressure valve that decouples ingestion from exchange round-trips.

### Role in the Mesh

```
External (TradingView, REST, Pine Script)
        │
        ▼
┌─────────────────┐
│  hoox (Gateway) │  ← public
└────────┬────────┘
         │
    ┌────┴────┐
    │  Queue  │  ← backpressure / decoupling
    └────┬────┘
         │
         ▼
  trade-worker    ← execution (private)
```

### Service Bindings

| Target Worker                             | Binding             | Protocol              |
| ----------------------------------------- | ------------------- | --------------------- |
| [`trade-worker`](../trade-worker)         | `TRADE_SERVICE`     | HTTP service binding  |
| [`telegram-worker`](../telegram-worker)   | `TELEGRAM_SERVICE`  | Notification on error |
| [`analytics-worker`](../analytics-worker) | `ANALYTICS_SERVICE` | Event telemetry       |

### Entry Points

| Method | Path           | Auth         | Description                                |
| ------ | -------------- | ------------ | ------------------------------------------ |
| `POST` | `/webhook`     | API key      | Primary signal ingress (TradingView, REST) |
| `POST` | `/process`     | Internal key | Legacy internal routing                    |
| `POST` | `/api/signals` | API key      | Structured signal submission               |
| `GET`  | `/health`      | None         | Liveness probe                             |

### Development

```bash
bun test workers/hoox
```

### License

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — part of the HOOX open-core mesh.
