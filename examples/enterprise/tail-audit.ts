/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HOOX Enterprise - Tail Worker for audit enrichment + redaction
 *
 * Deploy as a Tail Worker attached to key scripts (gateway, trade, workflows).
 * Sends enriched events to a Queue or directly to Logpush pipeline.
 */

export interface Env {
  AUDIT_QUEUE?: Queue;
}

export default {
  async tail(events: TraceItem[], env: Env) {
    const enriched = events.map((ev) => {
      const tenant =
        ev.scriptTags?.find((t: string) => t.startsWith("tenant:"))?.slice(7) ??
        "global";

      return {
        timestamp: ev.eventTimestamp,
        ray: ev.rayID,
        script: ev.scriptName,
        tenant,
        outcome: ev.outcome,
        // redact sensitive data
        logs: (ev.logs || []).map((l) => ({
          level: l.level,
          message: String(l.message || "").replace(
            /([A-Za-z0-9_-]{20,})/g,
            "[REDACTED]"
          ),
        })),
        exceptions: ev.exceptions,
      };
    });

    if (env.AUDIT_QUEUE) {
      await env.AUDIT_QUEUE.sendBatch(enriched.map((e) => ({ body: e })));
    } else {
      // fallback console for local dev
      console.log("AUDIT", JSON.stringify(enriched));
    }
  },
};
