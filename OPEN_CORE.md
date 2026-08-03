<!--
  Copyright (c) 2026 HOOX · jango-blockchained (hoox-sh)
  SPDX-License-Identifier: CC-BY-4.0
-->

# HOOX Open Core Model

HOOX follows an **Open Core** development and licensing model.

## Philosophy

- The **core technology** is open source and freely available.
- The most advanced, complex, or commercially valuable features are developed as a separate **Enterprise** layer.
- This allows the project to remain a credible open source reference implementation while building a sustainable business around institutional use cases.

## What Is Open Core

| Component                               | Status     | License            | Repository |
| --------------------------------------- | ---------- | ------------------ | ---------- |
| Core architecture & workers             | Open       | CC-BY-4.0\*        | Public     |
| `packages/shared` (base)                | Open       | CC-BY-4.0\*        | Public     |
| CLI, TUI, Dashboard (core)              | Open       | CC-BY-4.0\*        | Public     |
| Architecture docs & academic paper      | Open       | CC-BY-4.0          | Public     |
| Basic usage of Cloudflare primitives    | Open       | CC-BY-4.0\*        | Public     |
| **Advanced multi-tenant SaaS platform** | Commercial | Commercial license | Private    |
| **Proprietary risk / AI models**        | Commercial | Commercial license | Private    |
| **Full compliance & audit pipelines**   | Commercial | Commercial license | Private    |
| **Hosted control plane + billing**      | Commercial | Commercial license | Private    |
| **Enterprise support & SLAs**           | Commercial | Commercial         | Private    |

\* We are considering relicensing the open source code portions to **Apache 2.0** for better compatibility with commercial users and contributors. Documentation will likely stay under CC-BY-4.0.

## Why Open Core?

- Keeps the project useful and referenceable for the community and for the academic paper.
- Allows serious institutional users (funds, prop shops) to have a clear commercial offering with support and SLAs.
- Protects the highest-value IP while still open-sourcing the architectural patterns that make HOOX special (Service Bindings + DOs + edge placement).
- Reduces "open core resentment" by being transparent about the split.

## Relationship Between Open Core and Enterprise

The Enterprise version is built **on top of** the open core:

- It uses the same 10-worker mental model.
- It heavily leverages the open `packages/shared` library.
- It adds commercial-only components:
  - Workers for Platforms orchestration layer
  - Advanced proprietary Workflows
  - Full Logpush + SIEM compliance stack
  - Tenant management, billing, and isolation controls
  - Enhanced AI risk systems with AI Gateway at scale

All public Enterprise architecture documentation lives in `docs/devops/enterprise/`. These documents describe the **design** and how the commercial layer extends the open core. The actual proprietary implementation code is not public.

## Licensing for the Open Core

**Current (as of July 2026):**

- Documentation and papers: **CC-BY-4.0**
- Code (including this repository): **CC-BY-4.0**

**Recommended for the Open Core going forward:**

We strongly recommend moving the **code** of the open core to **Apache License 2.0**:

- Much better for commercial adoption and contributions.
- Explicit patent grant.
- Clearer compatibility with companies that want to build on or embed the open core.
- Still fully open source.

Documentation can remain under CC-BY-4.0 (or we can dual-license it).

The commercial Enterprise layer will use a separate proprietary/commercial license.

### Proposed License Structure

| Component                | Recommended License | Repository |
| ------------------------ | ------------------- | ---------- |
| Open Core code           | Apache 2.0          | Public     |
| Documentation & papers   | CC-BY-4.0           | Public     |
| Enterprise layer (code)  | Commercial license  | Private    |
| Enterprise support/tools | Commercial          | Private    |

If we keep CC-BY-4.0 for code, it remains very permissive but can be confusing for some corporate legal teams.

## For Contributors

- Contributions to the open core are very welcome.
- If you are building something that feels "Enterprise-only", we may suggest it lives in the commercial layer instead.
- The boundary is intentionally discussed publicly so everyone understands what is open vs commercial.

## For Users & Companies

- You can use the open core completely freely (subject to the license).
- If you need multi-tenancy at scale, advanced compliance features, hosted operation, or dedicated support, the Enterprise offering is the appropriate path.

## Current Status (as of 2026)

The open core is the primary codebase in this repository.

The Enterprise layer is in active design and early implementation in a separate private repository.

See `docs/devops/enterprise/` for the current architectural direction of the commercial extension.

See [OPEN_CORE_FEATURE_SPLIT.md](OPEN_CORE_FEATURE_SPLIT.md) for the detailed feature boundary.

---

This model is designed to be sustainable while preserving the spirit of the original open HOOX project.
