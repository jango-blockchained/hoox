/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * cloudflare-workers-shim.js
 *
 * Minimal shim for the `cloudflare:workers` import that some worker
 * bundles use (e.g. `import { DurableObject } from "cloudflare:workers"`).
 *
 * This shim is the runtime replacement for the `cloudflare:workers` module
 * in self-hosted mode (Bun.serve + server.js). It deliberately does NOT
 * provide real Cloudflare Workers semantics — it throws a clear error
 * pointing operators to the Cloudflare deployment.
 *
 * Design decision: option (a) from the 2026-06-04 Docker setup review
 * (subtask 07). "Fail loudly." This is the safest default: it surfaces
 * the limitation immediately rather than silently producing no-op
 * behavior (which was the bug in the original Dockerfile.prod polyfill).
 *
 * Operators running self-hosted for development or testing are expected
 * to either:
 *   1. Accept the limitations and use the Cloudflare deployment for
 *      production (recommended).
 *   2. Replace this shim with a real adapter (e.g. an in-memory Map-based
 *      DO, or a workerd/miniflare integration) — option (b) or (c) from
 *      the review.
 *
 * See DESIGN.md → Self-Hosted Limitations for the full picture.
 */

class DurableObject {
  // eslint-disable-next-line no-unused-vars
  constructor(_ctx, _env) {
    throw new Error(
      "DurableObject bindings are not supported in self-hosted mode " +
        "(subtask 07, option a). The shim throws on instantiation by " +
        "design. Use the Cloudflare hoox deployment for full DO semantics, " +
        "or replace this shim with a real adapter. " +
        "See DESIGN.md \u2192 Self-Hosted Limitations."
    );
  }
}

class DurableObjectNamespace {
  // eslint-disable-next-line no-unused-vars
  idFromName(_name) {
    throw new Error(
      "DurableObjectNamespace is not supported in self-hosted mode. " +
        "See DESIGN.md \u2192 Self-Hosted Limitations."
    );
  }
  // eslint-disable-next-line no-unused-vars
  newUniqueId(_options) {
    throw new Error(
      "DurableObjectNamespace.newUniqueId is not supported in self-hosted mode."
    );
  }
  // eslint-disable-next-line no-unused-vars
  idFromString(_id) {
    throw new Error(
      "DurableObjectNamespace.idFromString is not supported in self-hosted mode."
    );
  }
  // eslint-disable-next-line no-unused-vars
  get(_id) {
    throw new Error(
      "DurableObjectNamespace.get is not supported in self-hosted mode."
    );
  }
}

// Stub types that should never be reached (would indicate a worker is
// trying to use a binding in self-hosted mode). Kept as no-op classes so
// `instanceof` checks don't throw, but instantiation/usage still surfaces
// a clear error.
class _NotSupported {
  constructor() {
    throw new Error(
      "This Cloudflare binding is not supported in self-hosted mode. " +
        "See DESIGN.md \u2192 Self-Hosted Limitations."
    );
  }
}

module.exports = {
  DurableObject,
  DurableObjectNamespace,
  DurableObjectStub: _NotSupported,
  DurableObjectId: _NotSupported,
  DurableObjectTransaction: _NotSupported,
  // Storage primitives — not supported in self-hosted mode.
  R2: _NotSupported,
  R2Bucket: _NotSupported,
  R2Object: _NotSupported,
  R2Headers: _NotSupported,
  D1Database: _NotSupported,
  D1PreparedStatement: _NotSupported,
  D1Result: _NotSupported,
  KVNamespace: _NotSupported,
  AnalyticsEngineDataset: _NotSupported,
  VectorizeIndex: _NotSupported,
  // Type-only re-exports (compile-time only, no runtime behavior).
  ExportedHandler: undefined,
  ExecutionContext: undefined,
  // Event types.
  ScheduledController: undefined,
  ScheduledEvent: undefined,
  QueueController: undefined,
  QueueEvent: undefined,
  EmailMessage: undefined,
  TraceItem: undefined,
};
