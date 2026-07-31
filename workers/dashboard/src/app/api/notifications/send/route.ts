/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnvVar, getInternalAuthKeys } from "@/lib/config";

// nodejs runtime: dashboard routes consistently use `nodejs` because
// OpenNext's build output omits edge chunk files. See test-coverage.md.
// Middleware already enforces auth (see src/middleware.ts).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Zod schema (source of truth) ────────────────────────────────────────
//
// Mirrors the client-side `NotificationFormSchema` in
// `components/dashboard/notification-tester.tsx`. Zod v4 at every external
// boundary is mandated by the code-quality standard.
const NotificationLevelSchema = z.enum(["info", "warning", "error", "success"]);
const NotificationRequestSchema = z.object({
  chatId: z
    .string()
    .min(1, "Chat ID is required")
    .regex(/^-?\d+$/u, "Chat ID must be numeric (Telegram chat ID)"),
  level: NotificationLevelSchema,
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less"),
  message: z
    .string()
    .min(1, "Message body is required")
    .max(4000, "Message must be 4000 characters or less"),
});

type NotificationRequest = z.infer<typeof NotificationRequestSchema>;

/**
 * Resolve the telegram-worker URL from Cloudflare env vars.
 *
 * Falls back to a hard-coded dev URL so the route is usable without
 * configuration during local development. Production deployments
 * configure `TELEGRAM_WORKER_URL` in wrangler.jsonc `vars`.
 */
function getTelegramWorkerUrl(): string {
  return (
    getEnvVar("TELEGRAM_WORKER_URL") ||
    "https://telegram-worker.cryptolinx.workers.dev"
  );
}

/**
 * Resolve the shared internal-auth key used for the dashboard →
 * telegram-worker hop. Matches the pattern in lib/config.ts.
 */
function getInternalKey(): string | undefined {
  return getInternalAuthKeys().telegram;
}

/**
 * Format a level into a telegram-friendly emoji + label. The telegram-worker
 * will then translate this into the appropriate MarkdownV2 decoration.
 */
function formatLevelEmoji(level: NotificationRequest["level"]): string {
  switch (level) {
    case "info":
      return "ℹ️";
    case "warning":
      return "⚠️";
    case "error":
      return "🔴";
    case "success":
      return "✅";
  }
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid JSON body — expected application/json with chatId, level, title, message",
        code: "INVALID_JSON",
      },
      { status: 400 }
    );
  }

  const parsed = NotificationRequestSchema.safeParse(raw);
  if (!parsed.success) {
    // Surface the first issue only — clients show per-field errors from the
    // Zod client schema; this fallback covers schema drift.
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: firstIssue?.message ?? "Invalid request body",
        code: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const emoji = formatLevelEmoji(payload.level);
  const text = `${emoji} *${payload.title}*\n\n${payload.message}`;

  // Build headers. Use the internal auth key if one is configured;
  // the telegram-worker will reject the call otherwise (fail-closed).
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const internalKey = getInternalKey();
  if (!internalKey) {
    // Soft-warn in the response path via structured logging; still attempt
    // the hop so local telegram-workers without auth keep working.
    console.warn(
      "notifications/send: TELEGRAM internal auth key is not configured — request may be rejected by telegram-worker"
    );
  } else {
    headers["X-Internal-Auth-Key"] = internalKey;
  }

  const telegramUrl = `${getTelegramWorkerUrl().replace(/\/$/, "")}/send`;

  try {
    const res = await fetch(telegramUrl, {
      method: "POST",
      headers,
      // The telegram-worker exposes a /send endpoint accepting
      // { chat_id, text, parse_mode }. We forward the validated fields
      // directly so a chat-ID typo never reaches the worker.
      body: JSON.stringify({
        chat_id: payload.chatId,
        text,
        parse_mode: "MarkdownV2",
        level: payload.level,
        title: payload.title,
        source: "dashboard-tester",
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
        description?: string;
        message?: string;
      };
      const detail =
        errBody.error ??
        errBody.description ??
        errBody.message ??
        `Telegram worker responded with HTTP ${res.status}`;

      // 401/403 almost always mean the internal key is missing/wrong.
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          {
            success: false,
            error: `Telegram worker rejected the request (${res.status}). Check TELEGRAM_INTERNAL_KEY_BINDING. ${detail}`,
            code: "TELEGRAM_AUTH",
          },
          { status: 502 }
        );
      }

      // 4xx is a client error (bad chat ID, etc.) — return 400.
      // 5xx stays 502 to indicate the upstream worker misbehaved.
      const status = res.status >= 500 ? 502 : 400;
      return NextResponse.json(
        {
          success: false,
          error: detail,
          code: res.status >= 500 ? "TELEGRAM_UPSTREAM" : "TELEGRAM_CLIENT",
        },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Notification dispatched to telegram-worker",
      forwarded: {
        chatId: payload.chatId,
        level: payload.level,
        title: payload.title,
      },
    });
  } catch (err) {
    console.error("notifications/send error:", err);
    const detail =
      err instanceof Error ? err.message : "Failed to reach telegram-worker";
    return NextResponse.json(
      {
        success: false,
        error: `Could not reach telegram-worker at ${getTelegramWorkerUrl()}: ${detail}`,
        code: "TELEGRAM_UNREACHABLE",
      },
      { status: 502 }
    );
  }
}
