/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { ENV_KEYS, getEnvVar } from "@/lib/config";
import { Errors } from "@jango-blockchained/hoox-shared/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALL_SECRETS = [
  "AGENT_INTERNAL_KEY",
  "INTERNAL_KEY_BINDING",
  "API_SERVICE_KEY_BINDING",
  "TELEGRAM_INTERNAL_KEY_BINDING",
  "WEBHOOK_API_KEY_BINDING",
  "BINANCE_KEY_BINDING",
  "BINANCE_SECRET_BINDING",
  "MEXC_KEY_BINDING",
  "MEXC_SECRET_BINDING",
  "BYBIT_KEY_BINDING",
  "BYBIT_SECRET_BINDING",
  "TG_BOT_TOKEN_BINDING",
  "EMAIL_USER_BINDING",
  "EMAIL_PASS_BINDING",
];

const INTERNAL_KEY_SECRETS = [
  "AGENT_INTERNAL_KEY",
  "INTERNAL_KEY_BINDING",
  "API_SERVICE_KEY_BINDING",
  "TELEGRAM_INTERNAL_KEY_BINDING",
];

async function getCloudflareAccountId(): Promise<string | null> {
  return (
    getEnvVar(ENV_KEYS.cloudflare.accountId) ||
    "debc6545e63bea36be059cbc82d80ec8"
  );
}

async function getCloudflareApiToken(): Promise<string | null> {
  return getEnvVar(ENV_KEYS.cloudflare.apiToken) || null;
}

async function getCloudflareSecretStoreId(): Promise<string | null> {
  return (
    getEnvVar(ENV_KEYS.cloudflare.secretStoreId) ||
    "48433bc559a943f09d9d6c622e188fd5"
  );
}

export async function GET() {
  try {
    const accountId = await getCloudflareAccountId();
    const apiToken = await getCloudflareApiToken();
    const storeId = await getCloudflareSecretStoreId();

    if (!apiToken || !accountId || !storeId) {
      return Errors.internal("Cloudflare Secret Store is not configured");
    }

    let fetchedSecrets: { name: string }[] = [];

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/secrets_store/stores/${storeId}/secrets`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const data = (await response.json()) as {
      success: boolean;
      result?: { name: string }[];
    };
    if (data.success && data.result) {
      fetchedSecrets = data.result;
    }

    const availableNames = new Set(fetchedSecrets.map((s) => s.name));

    const syncedSecrets = ALL_SECRETS.map((name) => ({
      name,
      synced: availableNames.has(name) || !!getEnvVar(name),
    }));

    return NextResponse.json({
      success: true,
      secrets: syncedSecrets,
      internalKeys: INTERNAL_KEY_SECRETS.map((name) => ({
        name,
        synced: availableNames.has(name) || !!getEnvVar(name),
      })),
    });
  } catch (err) {
    return Errors.internal(String(err));
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string };
    const { action } = body;

    // We no longer sync to pages secrets for trading keys, the CLI manage.ts directly updates the Secret Store.
    if (action === "sync-to-pages" || action === "sync-all-internal-keys") {
      return NextResponse.json({
        success: true,
        message:
          "Secrets should be updated via the CLI (bun run scripts/manage.ts secrets update-cf) or Cloudflare Dashboard. The UI check relies on the Cloudflare Secret Store API.",
        command: `bun run scripts/manage.ts secrets update-cf <secretName> <workerName>`,
      });
    }

    return Errors.badRequest("Unknown action");
  } catch (err) {
    return Errors.internal(String(err));
  }
}
