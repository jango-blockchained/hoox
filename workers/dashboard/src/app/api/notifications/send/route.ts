/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Errors } from "@jango-blockchained/hoox-shared/errors";
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
      { success: false, error: "Invalid JSON body" },
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
        issues: parsed.error.issues,
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
  if (internalKey) {
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
      };
      const detail =
        errBody.error ??
        errBody.description ??
        `Telegram worker responded with ${res.status}`;
      // 4xx is a client error (bad chat ID, missing internal key, etc.) —
      // return 400 to mirror the cause. 5xx stays 502 to indicate the
      // upstream worker misbehaved.
      const status = res.status >= 500 ? 502 : 400;
      return NextResponse.json({ success: false, error: detail }, { status });
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
    return Errors.internal("Failed to reach telegram-worker");
  }
}
