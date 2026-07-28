/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WorkerManifest } from "./types.js";

/**
 * Compute reverse service binding mapping.
 * Returns a map of worker-name -> list-of-workers-that-call-it.
 */
function deriveCalledBy(
  manifests: Record<string, WorkerManifest>
): Record<string, string[]> {
  const calledBy: Record<string, Set<string>> = {};
  for (const [workerName, manifest] of Object.entries(manifests)) {
    if (!calledBy[workerName]) calledBy[workerName] = new Set();
    for (const svc of manifest.services) {
      if (!calledBy[svc.service]) calledBy[svc.service] = new Set();
      calledBy[svc.service].add(workerName);
    }
  }
  const result: Record<string, string[]> = {};
  for (const [worker, callers] of Object.entries(calledBy)) {
    result[worker] = [...callers].sort();
  }
  return result;
}

const manifests: Record<string, WorkerManifest> = {
  hoox: {
    name: "hoox",
    path: "workers/hoox-worker",
    vars: {
      WEBHOOK_API_KEY_BINDING: {
        type: "secret",
        description: "External webhook auth key",
      },
      INTERNAL_KEY_BINDING: {
        type: "secret",
        description: "Inter-worker auth key",
      },
      HA_TOKEN_BINDING: { type: "secret", description: "Home Assistant token" },
    },
    services: [
      {
        binding: "TRADE_SERVICE",
        service: "trade-worker",
        description: "Trading functionality",
      },
      {
        binding: "TELEGRAM_SERVICE",
        service: "telegram-worker",
        description: "Notifications",
      },
    ],
    infrastructure: {
      kv: [
        { binding: "SESSIONS_KV", description: "Webhook session storage" },
        {
          binding: "CONFIG_KV",
          description: "Configuration + rate limiter state",
        },
      ],
      vectorize: [{ binding: "VECTORIZE_INDEX", index: "my-rag-index" }],
      ai: true,
      queues: { producer: ["trade-execution"] },
      durableObjects: [
        { name: "IDEMPOTENCY_STORE", className: "IdempotencyStore" },
      ],
    },
    middleware: [
      "requireAuth",
      "requireInternalAuth",
      "cors",
      "rateLimit",
      "logger",
      "validate",
    ],
  },

  "trade-worker": {
    name: "trade-worker",
    path: "workers/trade-worker",
    vars: {
      INTERNAL_KEY_BINDING: {
        type: "secret",
        description: "Inter-worker auth key",
      },
      TELEGRAM_INTERNAL_KEY_BINDING: {
        type: "secret",
        description: "Telegram outbound auth",
      },
      BINANCE_KEY_BINDING: { type: "secret", description: "Binance API key" },
      BINANCE_SECRET_BINDING: {
        type: "secret",
        description: "Binance API secret",
      },
      MEXC_KEY_BINDING: { type: "secret", description: "MEXC API key" },
      MEXC_SECRET_BINDING: { type: "secret", description: "MEXC API secret" },
      BYBIT_KEY_BINDING: { type: "secret", description: "Bybit API key" },
      BYBIT_SECRET_BINDING: { type: "secret", description: "Bybit API secret" },
    },
    services: [
      {
        binding: "D1_SERVICE",
        service: "d1-worker",
        description: "Database operations",
      },
      {
        binding: "TELEGRAM_SERVICE",
        service: "telegram-worker",
        description: "Notifications",
      },
    ],
    infrastructure: {
      kv: [{ binding: "CONFIG_KV", description: "Configuration" }],
      d1: [
        {
          binding: "DB",
          database: "trade-data-db",
          description: "Trade operations",
        },
      ],
      r2: [
        {
          binding: "REPORTS_BUCKET",
          bucket: "trade-reports",
          description: "Trade reports",
        },
        {
          binding: "SYSTEM_LOGS_BUCKET",
          bucket: "hoox-system-logs",
          description: "Verbose exchange logs",
        },
      ],
      queues: { consumer: ["trade-execution"] },
    },
    middleware: ["requireInternalAuth"],
  },

  "telegram-worker": {
    name: "telegram-worker",
    path: "workers/telegram-worker",
    vars: {
      INTERNAL_KEY_BINDING: {
        type: "secret",
        description: "Inter-worker auth key",
      },
      TG_BOT_TOKEN_BINDING: {
        type: "secret",
        description: "Telegram bot token",
      },
      TG_CHAT_ID_BINDING: { type: "secret", description: "Default chat ID" },
      TELEGRAM_SECRET_TOKEN: {
        type: "secret",
        description: "Webhook verification token",
      },
    },
    services: [],
    infrastructure: {
      kv: [{ binding: "CONFIG_KV", description: "Configuration" }],
      r2: [
        {
          binding: "UPLOADS_BUCKET",
          bucket: "user-uploads",
          description: "User uploaded files",
        },
      ],
      vectorize: [{ binding: "VECTORIZE_INDEX", index: "my-rag-index" }],
      ai: true,
    },
    middleware: ["requireInternalAuth"],
  },

  "d1-worker": {
    name: "d1-worker",
    path: "workers/d1-worker",
    vars: {
      INTERNAL_KEY_BINDING: {
        type: "secret",
        description: "Inter-worker auth key",
      },
    },
    services: [],
    infrastructure: {
      kv: [{ binding: "CONFIG_KV", description: "Configuration" }],
      d1: [
        {
          binding: "DB",
          database: "trade-data-db",
          description: "Main database",
        },
      ],
    },
    middleware: ["requireInternalAuth"],
  },

  "web3-wallet-worker": {
    name: "web3-wallet-worker",
    path: "workers/web3-wallet-worker",
    vars: {
      WALLET_PK_SECRET: { type: "secret", description: "Wallet private key" },
      WALLET_MNEMONIC_SECRET: {
        type: "secret",
        description: "Wallet mnemonic phrase",
      },
    },
    services: [
      {
        binding: "TELEGRAM_SERVICE",
        service: "telegram-worker",
        description: "Notifications",
      },
    ],
    infrastructure: {},
    middleware: ["requireInternalAuth"],
  },

  "agent-worker": {
    name: "agent-worker",
    path: "workers/agent-worker",
    vars: {
      AGENT_INTERNAL_KEY: { type: "secret", description: "Agent worker auth" },
      INTERNAL_KEY_BINDING: {
        type: "secret",
        description: "Inter-worker auth key",
      },
    },
    services: [
      {
        binding: "TRADE_SERVICE",
        service: "trade-worker",
        description: "Trading functionality",
      },
      {
        binding: "TELEGRAM_SERVICE",
        service: "telegram-worker",
        description: "Notifications",
      },
    ],
    infrastructure: {
      kv: [{ binding: "CONFIG_KV", description: "Configuration" }],
      d1: [
        {
          binding: "DB",
          database: "trade-data-db",
          description: "Portfolio queries",
        },
      ],
      ai: true,
    },
    middleware: ["requireInternalAuth"],
    cron: ["*/5 * * * *"],
  },

  "email-worker": {
    name: "email-worker",
    path: "workers/email-worker",
    vars: {
      INTERNAL_KEY_BINDING: {
        type: "secret",
        description: "Inter-worker auth key",
      },
      EMAIL_HOST_BINDING: { type: "secret", description: "Email IMAP host" },
      EMAIL_USER_BINDING: { type: "secret", description: "Email username" },
      EMAIL_PASS_BINDING: { type: "secret", description: "Email password" },
      TRADE_WORKER_NAME: {
        type: "plaintext",
        description: "Trade worker service name",
        default: "trade-worker",
      },
      USE_IMAP: {
        type: "plaintext",
        description: "Use IMAP for email",
        default: "false",
      },
      MAILGUN_API_KEY: { type: "secret", description: "Mailgun API key" },
      EMAIL_SCAN_SUBJECT: { type: "secret", description: "Email scan subject" },
    },
    services: [
      {
        binding: "TRADE_SERVICE",
        service: "trade-worker",
        description: "Trading functionality",
      },
    ],
    infrastructure: {
      kv: [{ binding: "CONFIG_KV", description: "Configuration" }],
    },
    middleware: ["requireInternalAuth"],
    cron: ["*/5 * * * *"],
  },

  "analytics-worker": {
    name: "analytics-worker",
    path: "workers/analytics-worker",
    vars: {
      CLOUDFLARE_API_TOKEN: {
        type: "secret",
        description: "CF API token for Analytics SQL",
      },
      CLOUDFLARE_ACCOUNT_ID: {
        type: "plaintext",
        description: "CF Account ID",
      },
    },
    services: [],
    infrastructure: {
      analyticsEngine: true,
    },
    middleware: [],
  },

  "report-worker": {
    name: "report-worker",
    path: "workers/report-worker",
    vars: {
      CF_API_TOKEN_BINDING: {
        type: "secret",
        description: "CF API token for Browser Rendering",
      },
      ACCOUNT_ID: { type: "plaintext", description: "CF Account ID" },
    },
    services: [
      {
        binding: "D1_SERVICE",
        service: "d1-worker",
        description: "Database queries",
      },
      {
        binding: "TELEGRAM_SERVICE",
        service: "telegram-worker",
        description: "Notifications",
      },
    ],
    infrastructure: {
      r2: [
        {
          binding: "REPORTS_BUCKET",
          bucket: "trade-reports",
          description: "PDF reports",
        },
      ],
    },
    middleware: ["requireInternalAuth"],
    cron: ["0 8 * * *", "0 18 * * *"],
  },

  dashboard: {
    name: "dashboard",
    path: "workers/dashboard",
    vars: {
      DASHBOARD_USER: {
        type: "secret",
        description: "Dashboard admin username",
      },
      DASHBOARD_PASS: {
        type: "secret",
        description: "Dashboard admin password",
      },
      SESSION_SECRET: { type: "secret", description: "Session encryption key" },
    },
    services: [
      {
        binding: "D1_SERVICE",
        service: "d1-worker",
        description: "Database queries",
      },
      {
        binding: "AGENT_SERVICE",
        service: "agent-worker",
        description: "AI risk data",
      },
    ],
    infrastructure: {
      kv: [{ binding: "CONFIG_KV", description: "Configuration" }],
      ai: true,
    },
    middleware: [],
  },
};

/** Map of worker-name -> list-of-workers-that-call-it (computed). */
export const CALLED_BY: Record<string, string[]> = deriveCalledBy(manifests);

/** The canonical registry of all worker manifests. */
export const WORKER_MANIFESTS: Record<string, WorkerManifest> = manifests;

/** List of all worker names in the registry. */
export const WORKER_NAMES: string[] = Object.keys(manifests).sort();
