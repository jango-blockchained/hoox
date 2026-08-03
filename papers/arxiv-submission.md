<!--
  Copyright (c) 2026 HOOX · jango-blockchained (hoox-sh)
  SPDX-License-Identifier: CC-BY-4.0
-->

# arXiv Submission Metadata — HOOX Paper

Use this document when submitting at [https://arxiv.org/submit](https://arxiv.org/submit).
Primary LaTeX source (core, recommended): `hoox-arxiv-paper-core.tex`
Full monograph source: `hoox-arxiv-paper.tex`

- `references.bib` + `figures/`.

---

## Submission type

- **New submission** (cs)
- **Format:** PDF + LaTeX source upload

---

## Title

```
HOOX: An Edge-Native Algorithmic Trading Framework on Cloudflare Workers
```

---

## Authors

| Field           | Value                        |
| --------------- | ---------------------------- |
| **Author 1**    | jango_blockchained (hoox-sh) |
| **Affiliation** | Independent Researcher       |
| **ORCID**       | _(add if you have one)_      |

---

## Abstract (paste into arXiv form)

Must match `front-matter.tex` exactly. Current text:

```
Algorithmic trading systems have traditionally relied on virtual private servers (VPS) in centralized data centers, incurring network latency, operational cost, and single points of failure. This paper presents HOOX, an open-source, edge-native algorithmic trading framework implemented entirely on Cloudflare Workers. HOOX decomposes trading logic into ten Workers that communicate via Service Bindings, achieving sub-millisecond inter-service overhead and a median production latency of 22 ms from webhook to centralized exchange (CEX) acknowledgment on the direct path (N = 16,104 terminal acknowledgments, July 2025--July 2026).

Two measurement regimes that prior summaries often conflate are distinguished: (i) synthetic fast-path probes that short-circuit before exchange submission and characterize internal mesh latency (N = 200); and (ii) production signal-to-ack including HMAC-signed REST placement and exchange parsing (N = 18,742). Four platform primitives uncommon in retail trading stacks are integrated: Durable Objects for strongly consistent duplicate suppression, Smart Placement for proximity routing to exchange origins, Cloudflare Queues with exponential backoff for outage resilience, and a deterministic five-minute cron risk manager.

Over the 12-month deployment, queued signals reached a terminal exchange status in 99.97% of cases within five minutes across 14 exchange maintenance events (1,841 of 1,842), and zero duplicate fills were attributable to idempotency failures. The architecture, security model, evaluation, and reproducibility commands are documented; full implementation listings appear in the appendix. Released under CC BY 4.0.
```

---

## Comments (optional field — recommended)

```
Core paper (recommended): ~15-25 pages focused on architecture + evaluation
(N = 18,742 production signals, July 2025--July 2026, on the direct path;
median 22 ms signal-to-ack; requires @hoox-sh/hoox-cli v0.9.3+
for the extended hop tracing used in the fast-path probe tables).
Full monograph (extended technical reference): ~90+ pages including ADRs,
deep dives, complete listings, and full runtime details.
Open source: https://github.com/hoox-sh/hoox-setup
```

---

## Report number (optional)

```
HOOX-2026-001
```

---

## Category

**Primary:**

```
cs.DC
```

**Secondary (cross-list, optional):**

```
cs.SE
```

---

## Files to upload

**Recommendation:** For the initial arXiv submission, use the **core paper** (focused, ~15-20 pages). Upload the full monograph only if you want reviewers to have the complete technical reference in one document.

### Core paper (recommended)

```
hoox-arxiv-paper-core.tex
front-matter.tex
macros.tex
references.bib
sections/01-introduction.tex ... sections/10-conclusion.tex
appendices/A-reproducibility.tex
appendices/C-threat-model.tex
appendices/F-test-excerpts.tex
listings/*   (only the ones actually referenced in core)
generated/graph-tables.tex
figures/*.tex
figures/*.pdf
Makefile
hoox-arxiv-paper-core.pdf
```

### Full monograph (extended version)

```
hoox-arxiv-paper.tex   (includes Sections 11-15 + all appendices)
... (everything above plus the expansion sections and remaining appendices)
hoox-arxiv-paper.pdf
```

### Figure PDFs (pre-built via `make figures`)

```
figures/architecture.pdf
figures/latency-taxonomy.pdf
figures/signal-lifecycle.pdf
figures/agent-cron-lifecycle.pdf
figures/report-cron-lifecycle.pdf
figures/observability-flow.pdf
figures/graph-overview.pdf
```

---

## Open Core Model & Enterprise Note

HOOX uses an **Open Core** model:

- Core architecture, most code, CLI, and documentation are open source (Apache-2.0 for code, CC-BY-4.0 for docs).
- Advanced institutional features (full multi-tenancy SaaS platform, proprietary risk models, compliance pipelines, etc.) are part of the closed-source **HOOX Enterprise** offering under a commercial license.

See:

- `OPEN_CORE.md`
- `OPEN_CORE_FEATURE_SPLIT.md`
- `docs/devops/enterprise/`
- `papers/hoox-enterprise-architecture-note.md`

The paper describes the open core; Enterprise builds upon it.

## Build commands before upload

```bash
cd papers

# --- Core paper (recommended for submission) ---
make pdf-tikz-core
# or
make listings graph-tables figures && make pdf-core

# Core tarball:
make arxiv-tarball-core

# --- Full monograph ---
make pdf-tikz
# or
make listings graph-tables figures && make pdf

# Full tarball:
make arxiv-tarball
# → papers/dist/hoox-arxiv-submission.tar.gz  (or core equivalent)
```

After building the core, inspect the produced PDF page count and trim any accidentally pulled heavy content.

---

## Proof-of-Concept companion document (new)

In addition to the core and full monograph, a focused academic **Proof-of-Concept** report is provided:

- `hoox-proof-of-concept.md` — self-contained Markdown, arXiv-style
- `hoox-proof-of-concept.tex` — standalone LaTeX source (reuses macros/references when present)
- `hoox-proof-of-concept.pdf` — generated PDF (A4, academic formatting)

This shorter document (~8–10 pages) is suitable as a standalone workshop paper, technical report, or citable PoC summary. It emphasizes the proof-of-concept goals, key primitives demonstrated, primary results (22 ms median, reliability numbers), and reproducibility commands.

To build the PoC LaTeX version (recommended for consistency):

```bash
cd papers
pdflatex hoox-proof-of-concept
bibtex hoox-proof-of-concept
pdflatex hoox-proof-of-concept
pdflatex hoox-proof-of-concept
```

The Markdown version can be re-rendered to PDF using `md-to-pdf` + the accompanying `hoox-poc-academic.css` if desired.

---

## Suggested cover letter snippet

```
I submit a systems/experience paper describing HOOX, an open-source algorithmic trading
framework built entirely on Cloudflare Workers. The contribution is architectural:
edge-native microservices using Service Bindings, Durable Object duplicate
suppression, Smart Placement, and a reproducible evaluation methodology that
separates internal fast-path probes from production exchange-ack latency
(median 22 ms on the direct path, N = 16,104 terminal exchange acknowledgments
over the 12-month window July 2025--July 2026). The core paper focuses on
the architecture, key mechanisms, security model, and operational results.
The extended technical reference (ADRs, per-Worker deep dives, data layer,
runtime semantics, and full listing index) is available in the source
repository and as a companion document. The system is released under CC BY 4.0
at https://github.com/hoox-sh/hoox-setup.
```

---

## Checklist before submit

- [ ] Decide on core vs full (core recommended for most submissions)
- [ ] PDF compiles without errors (`make pdf-tikz-core` or `make pdf-tikz`)
- [ ] All seven TikZ figures render (`make figures`)
- [ ] Source tarball builds for the chosen variant
- [ ] Abstract in `front-matter.tex` and this file match
- [ ] Abstract matches what you paste into the arXiv form exactly
- [ ] `references.bib` included; no "Various" author, no fake entries (kreutz2015sgx, shpektor2019coldstart, jonas2017isolates, aws-lambda-trading have been removed)
- [ ] No private keys / internal URLs in the paper
- [ ] Category `cs.DC` (secondary `cs.SE`)
- [ ] Title uses "An Edge-Native Algorithmic Trading Framework"
- [ ] N (sample size) disclosed for the 22 ms claim: N = 200 fast-path probes, N = 18,742 production signals, N = 16,104 terminal acknowledgments
- [ ] Timeline uses "12-month" window (July 2025--July 2026) consistently
- [ ] Voice is impersonal throughout the body
- [ ] Update page count / comments field for the variant you are uploading
- [ ] Confirm bibliography resolves (search for Hasbrouck 2013, Budish 2015, Jonas 2019, Wang 2018, Lloyd 2018, Shahrad 2020, Agache 2020, McSherry 2015, DeCandia 2007, Nygren 2010, Singh 2015, NIST 800-207)
