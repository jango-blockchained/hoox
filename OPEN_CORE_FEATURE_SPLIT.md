<!--
  Copyright (c) 2026 HOOX · jango-blockchained (hoox-sh)
  SPDX-License-Identifier: CC-BY-4.0
-->

# HOOX Open Core vs Enterprise Feature Split

This document defines the clear boundary between the **Open Core** (public, open source) and the **Enterprise** layer (commercial, closed source).

## Guiding Principles

- The **Open Core** must be independently useful and production-capable for retail / power users / small teams.
- The **Enterprise** layer adds the capabilities needed for institutions, funds, prop shops, and SaaS platforms (multi-tenancy at scale, compliance, support, advanced proprietary features).
- Architecture and design patterns are documented publicly (even for Enterprise features) to maintain credibility and support the academic paper.
- Code for Enterprise-only features lives in a separate private repository.

---

## Feature Split Table

### Core Architecture & Infrastructure

| Feature / Component                  | Open Core | Enterprise (Commercial)         | Notes                             |
| ------------------------------------ | --------- | ------------------------------- | --------------------------------- |
| 10-worker mesh + Service Bindings    | Yes       | Uses + extends                  | Core model stays open             |
| Durable Objects (idempotency, basic) | Yes       | Enhanced                        | Basic SQLite DO patterns are open |
| Smart Placement                      | Yes       | Yes                             | Cloudflare primitive              |
| Queues (basic failover)              | Yes       | Advanced usage + higher limits  |                                   |
| D1, R2, KV, Vectorize (basic usage)  | Yes       | Scale + advanced patterns       |                                   |
| Browser Rendering (PDF reports)      | Yes       | Advanced compliance reports     |                                   |
| Workers AI + basic RAG               | Yes       | AI Gateway + proprietary models |                                   |

### Workers

| Worker / Component                | Open Core     | Enterprise (Commercial)          | Notes                                            |
| --------------------------------- | ------------- | -------------------------------- | ------------------------------------------------ |
| `hoox` (gateway)                  | Yes (basic)   | Multi-tenant dispatch            | Basic auth + rate limiting open                  |
| `trade-worker`                    | Yes (basic)   | Advanced execution               | Core order placement open                        |
| `agent-worker` (basic risk)       | Yes           | Proprietary risk models          | Simple trailing stops etc. open                  |
| `telegram-worker`, `email-worker` | Yes           | Enhanced                         |                                                  |
| `d1-worker`, `analytics-worker`   | Yes           | Tenant-isolated + scale          |                                                  |
| `report-worker`                   | Yes           | Compliance-grade                 |                                                  |
| `web3-wallet-worker`              | Yes           | Advanced DeFi                    |                                                  |
| **Dispatch Worker (WfP)**         | Basic example | Full multi-tenant platform       | Core WfP concepts open, full platform commercial |
| **User Workers**                  | Examples only | Full customer strategy execution |                                                  |

### Multi-Tenancy & Platform

| Feature                                 | Open Core         | Enterprise (Commercial)             | Notes                          |
| --------------------------------------- | ----------------- | ----------------------------------- | ------------------------------ |
| Single-tenant / self-hosted             | Yes               | Yes                                 | Fully supported in open core   |
| Basic tenant context (`TenantContext`)  | Yes (lightweight) | Full implementation                 | Basic types open for extension |
| Workers for Platforms (basic dispatch)  | Examples + docs   | Full SaaS hosting platform          |                                |
| Per-tenant isolation (DOs, queues, DBs) | Patterns + docs   | Production implementation + billing |                                |
| Tenant billing / metering / quotas      | No                | Yes                                 | Fully commercial               |
| Customer onboarding & self-service      | No                | Yes                                 |                                |

### Workflows & Durability

| Feature                               | Open Core       | Enterprise (Commercial)  | Notes       |
| ------------------------------------- | --------------- | ------------------------ | ----------- |
| Basic Workflow examples               | Yes             | —                        | Educational |
| Trade lifecycle as Workflow           | Basic skeleton  | Full production versions |             |
| Reconciliation & compliance workflows | Simple          | Advanced + human gates   |             |
| Long-running durable processes        | Patterns        | Full implementation      |             |
| Workflow + Agent integration          | Docs + examples | Production orchestration |             |

### Observability & Audit

| Feature                                 | Open Core       | Enterprise (Commercial)       | Notes |
| --------------------------------------- | --------------- | ----------------------------- | ----- |
| Analytics Engine (basic)                | Yes             | Tenant-tagged + scale         |       |
| Workers Logs + Traces                   | Yes             | Full + sampling               |       |
| Basic Logpush to R2                     | Examples + docs | Production + SIEM integration |       |
| Tail Workers                            | Examples        | Production audit pipeline     |       |
| Immutable audit trail                   | Concepts        | Full compliance stack         |       |
| SIEM export (Splunk, SentinelOne, etc.) | No              | Yes                           |       |

### Security

| Feature                                | Open Core                                     | Enterprise (Commercial)     | Notes                |
| -------------------------------------- | --------------------------------------------- | --------------------------- | -------------------- |
| Existing 5-layer model                 | Yes                                           | Extended                    |                      |
| Bot Management                         | Docs + basic rules                            | Full Enterprise features    |                      |
| API Shield (basic schema validation)   | Yes                                           | Advanced + mTLS             |                      |
| Zero Trust / Access (for dashboard)    | Examples                                      | Full policies + SCIM        |                      |
| Access service tokens (CLI/TUI remote) | Supported (env + fail-closed + doctor probes) | SSO, device posture, SCIM   | Prefer mgmt hostname |
| Tunnel runbooks (`cloudflared`)        | Docs + `hoox tunnel check`                    | Managed playbooks           | Private ingress      |
| Operator mTLS client certs (CLI/TUI)   | Transport name reserved                       | Full lifecycle + API Shield | Defense in depth     |
| AI Guardrails (basic)                  | Yes                                           | AI Gateway at scale         |                      |
| mTLS between services                  | Patterns                                      | Production                  |                      |

### AI & Advanced Features

| Feature                                 | Open Core | Enterprise (Commercial)        | Notes |
| --------------------------------------- | --------- | ------------------------------ | ----- |
| Basic Workers AI + Vectorize RAG        | Yes       | —                              |       |
| AI Gateway usage                        | Examples  | Full production + cost control |       |
| Proprietary risk models                 | No        | Yes                            |       |
| Natural language strategy configuration | Basic     | Advanced                       |       |
| Anomaly detection at scale              | No        | Yes                            |       |

### Operations & Support

| Feature                                      | Open Core        | Enterprise (Commercial)  | Notes |
| -------------------------------------------- | ---------------- | ------------------------ | ----- |
| Self-hosted on Free / Paid tiers             | Yes              | Yes                      |       |
| Self-hosted on Enterprise Cloudflare account | Docs + templates | Recommended              |       |
| Hosted SaaS offering                         | No               | Yes                      |       |
| Commercial support & SLAs                    | No               | Yes                      |       |
| On-call runbooks & operational playbooks     | Basic            | Full Enterprise versions |       |

### Licensing & Distribution

| Aspect                           | Open Core                     | Enterprise (Commercial)           | Notes                        |
| -------------------------------- | ----------------------------- | --------------------------------- | ---------------------------- |
| Source code                      | Open (Apache 2.0 recommended) | Closed source                     | See licensing section        |
| Documentation                    | CC-BY-4.0                     | CC-BY-4.0 + commercial extensions | Architecture docs are public |
| Academic paper                   | Fully open                    | References Enterprise layer       |                              |
| npm packages (`@hoox-sh/hoox-*`) | Open                          | Not published (private)           |                              |

---

## Technical Boundaries

### `packages/shared`

- **Open Core**: Core types (`TenantContext` lightweight version), middleware, router, service bindings, analytics, errors, health checks, basic schemas.
- **Enterprise layer** (private): Full tenant management, billing primitives, advanced audit emitters, proprietary model interfaces, complex Workflow orchestration helpers.

We deliberately keep `packages/shared` relatively small and stable in the open core. Enterprise can extend it or maintain a private fork if needed.

### Workers

Most workers have an "open core" version and can be extended in the Enterprise layer (via composition, inheritance patterns, or separate deployment).

### Documentation

All architecture and design documentation is public, even when it describes commercial features. This is intentional for credibility and to support the academic paper.

---

## What This Enables

- Individuals and small teams can use a powerful, fully open source version.
- Institutions get a supported, compliant, multi-tenant platform with proprietary enhancements.
- The open source community and academic work continue to benefit from the core architecture.
- Commercial development can move faster without being constrained by open source obligations on the highest-value IP.

---

**Last updated**: July 2026  
This document is the source of truth for the Open Core boundary.
