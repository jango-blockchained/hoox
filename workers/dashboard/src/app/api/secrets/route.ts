/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { ENV_KEYS, getEnvVar } from "@/lib/config";
import { Errors } from "@hoox-sh/hoox-shared/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Catalog names checked against Cloudflare Secrets Store (and process env).
 * Aligned with setup wizard + CLI SYSTEM_SECRET_NAMES + common integrations.
 */
const ALL_SECRETS = [
  // Mesh / system
  "INTERNAL_KEY_BINDING",
  "AGENT_INTERNAL_KEY",
  "WEBHOOK_API_KEY_BINDING",
  "TELEGRAM_INTERNAL_KEY_BINDING",
  "SESSION_SECRET",
  "TRADE_INTERNAL_KEY",
  "API_SERVICE_KEY_BINDING",
  // Exchanges
  "BINANCE_KEY_BINDING",
  "BINANCE_SECRET_BINDING",
  "MEXC_KEY_BINDING",
  "MEXC_SECRET_BINDING",
  "BYBIT_KEY_BINDING",
  "BYBIT_SECRET_BINDING",
  // Notifications / other
  "TG_BOT_TOKEN_BINDING",
  "WALLET_PK_SECRET",
  "WALLET_MNEMONIC_SECRET",
  "CLOUDFLARE_API_TOKEN",
  "EMAIL_USER_BINDING",
  "EMAIL_PASS_BINDING",
];

const INTERNAL_KEY_SECRETS = [
  "INTERNAL_KEY_BINDING",
  "AGENT_INTERNAL_KEY",
  "API_SERVICE_KEY_BINDING",
  "TELEGRAM_INTERNAL_KEY_BINDING",
  "TRADE_INTERNAL_KEY",
  "WEBHOOK_API_KEY_BINDING",
  "SESSION_SECRET",
];

/** Canonical CLI snippets returned to the UI. */
const CLI_HINTS = {
  automateMesh: "hoox keys generate && hoox secrets sync --system",
  syncSystem: "hoox secrets sync --system",
  set: "hoox secrets set <worker> <secretName>",
  list: "hoox secrets list",
} as const;

async function getCloudflareAccountId(): Promise<string | null> {
  return getEnvVar(ENV_KEYS.cloudflare.accountId) || null;
}

async function getCloudflareApiToken(): Promise<string | null> {
  return getEnvVar(ENV_KEYS.cloudflare.apiToken) || null;
}

async function getCloudflareSecretStoreId(): Promise<string | null> {
  return getEnvVar(ENV_KEYS.cloudflare.secretStoreId) || null;
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
      cli: CLI_HINTS,
    });
  } catch (err) {
    return Errors.internal(String(err));
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string };
    const { action } = body;

    // Dashboard never writes secrets; guide operators to the CLI.
    if (
      action === "sync-to-pages" ||
      action === "sync-all-internal-keys" ||
      action === "automate-mesh" ||
      action === "hint"
    ) {
      return NextResponse.json({
        success: true,
        message:
          "Mesh keys: run `hoox keys generate && hoox secrets sync --system` from the monorepo. Integration secrets: `hoox secrets set <worker> <name>` (interactive). Never paste live secrets into the dashboard.",
        cli: CLI_HINTS,
        command: CLI_HINTS.automateMesh,
      });
    }

    return Errors.badRequest("Unknown action");
  } catch (err) {
    return Errors.internal(String(err));
  }
}
