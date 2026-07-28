<!--
  Copyright (c) 2026 HOOX · jango-blockchained
  SPDX-License-Identifier: CC-BY-4.0
-->

# HOOX Enterprise Architecture Note (2026)

**This note describes the commercial Enterprise layer only.**

HOOX follows an **Open Core** model (see root `OPEN_CORE.md` and `OPEN_CORE_FEATURE_SPLIT.md`).

This short note accompanies the main HOOX academic paper / PoC, which focuses on the open core.

**HOOX Enterprise** is the institutional evolution of the core edge-native trading system.

## Key Additions over Core

- **Workers for Platforms** for multi-tenant isolation and customer strategy execution.
- **Workflows** for durable, long-running, retryable trade lifecycles, reconciliation, and compliance.
- **Logpush + R2 immutable audit** + Tail Workers for full regulatory traceability.
- **Enterprise security**: Bot Management, API Shield, Zero Trust / Access, advanced WAF.
- **Real-time**: Hibernatable WebSockets in Durable Objects for live exchange connectivity.
- **AI scale**: AI Gateway + larger Vectorize + higher limits.
- Higher/custom limits, data residency (R2 jurisdictions), dedicated support.

The architecture remains grounded in the same 10-worker + Service Bindings + DO + Smart Placement model described in the main paper.

See `docs/enterprise/` for public architecture design docs of the commercial layer (see root OPEN_CORE\* files for boundaries).

This enables HOOX to serve prop shops, funds, and platforms while preserving the original "no servers, everything at the edge" philosophy.

**Status**: Design phase (see approved plan.md and enterprise docs). Implementation will be incremental on top of the existing high-quality retail codebase.
