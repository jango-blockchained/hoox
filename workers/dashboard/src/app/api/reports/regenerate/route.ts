/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { Errors } from "@jango-blockchained/hoox-shared/errors";
import { getEnvVar, getInternalAuthKeys } from "@/lib/config";

export const dynamic = "force-dynamic";
// OpenNext / Next.js 16 on Cloudflare: keep nodejs runtime for binding access.
export const runtime = "nodejs";

const regenerateResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
});

/**
 * POST /api/reports/regenerate
 *
 * Kicks off an on-demand report generation by proxying to report-worker
 * `GET /report` (auth required).
 *
 * Wiring status:
 * - Preferred: `REPORT_SERVICE` service binding (not yet in wrangler.jsonc).
 * - Fallback: `REPORT_WORKER_URL` env var + internal auth key.
 * - Until either is available, return 503 with a clear operator message so
 *   the dashboard can toast a useful error instead of a generic failure.
 */
function getReportWorkerUrl(): string | undefined {
  return getEnvVar("REPORT_WORKER_URL");
}

export async function POST() {
  try {
    const reportUrl = getReportWorkerUrl();
    if (!reportUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Report regeneration is not yet wired up. Configure REPORT_WORKER_URL (or a REPORT_SERVICE binding) and ensure report-worker is reachable.",
          code: "REPORT_WORKER_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // report-worker uses the shared internal-auth middleware; prefer the
    // legacy/global binding key when a dedicated report key is not present.
    const keys = getInternalAuthKeys();
    const internalKey =
      getEnvVar("REPORT_INTERNAL_KEY") ??
      getEnvVar("INTERNAL_KEY_BINDING") ??
      keys.api ??
      keys.d1Read;
    if (internalKey) {
      headers["X-Internal-Auth-Key"] = internalKey;
    }

    const target = `${reportUrl.replace(/\/$/, "")}/report`;
    const res = await fetch(target, {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      const detail =
        errBody.error ??
        errBody.message ??
        `Report worker responded with ${res.status}`;
      const status = res.status >= 500 ? 502 : res.status === 401 ? 502 : 400;
      return NextResponse.json(
        {
          success: false,
          error: detail,
          code:
            res.status === 401 || res.status === 403
              ? "REPORT_WORKER_AUTH"
              : "REPORT_WORKER_ERROR",
        },
        { status }
      );
    }

    const payload = regenerateResponseSchema.parse({
      success: true,
      message: "Report generation started",
    });
    // Upstream returns 202 Accepted; surface that as success to the client.
    return NextResponse.json(payload, { status: 202 });
  } catch (err) {
    console.error("reports/regenerate error:", err);
    return Errors.internal(
      err instanceof Error ? err.message : "Failed to reach report-worker"
    );
  }
}
