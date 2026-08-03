/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Worker presets, dependency resolution, and integration definitions.
 *
 * Migrated from packages/cli/src/commands/init/types.ts
 * Secret names updated to match the canonical Worker Manifest Schema
 * (see packages/shared/src/schemas/registry.ts).
 * Pure data — no runtime dependencies, Worker-compatible.
 */
import type { WorkerPreset, IntegratedService } from "./types";

// ─── Presets ──────────────────────────────────────────────────────────

export const PRESETS: WorkerPreset[] = [
  {
    name: "minimal",
    label: "Minimal",
    description: "Gateway + D1 database — webhook processing only",
    workers: ["hoox", "d1-worker", "analytics-worker"],
    integrations: [],
  },
  {
    name: "standard",
    label: "Standard",
    description: "Trading + analytics + Telegram notifications",
    workers: [
      "hoox",
      "d1-worker",
      "trade-worker",
      "analytics-worker",
      "telegram-worker",
    ],
    integrations: ["binance", "telegram"],
  },
  {
    name: "full",
    label: "Full",
    description: "All workers + AI agent + DeFi + email",
    workers: [
      "hoox",
      "d1-worker",
      "trade-worker",
      "agent-worker",
      "telegram-worker",
      "analytics-worker",
      "email-worker",
      "web3-wallet-worker",
    ],
    integrations: ["binance", "bybit", "mexc", "telegram", "openai", "wallet"],
  },
];

// ─── Worker Dependencies ──────────────────────────────────────────────

/**
 * Worker dependency graph.
 * Key requires all values in its array.
 */
export const WORKER_DEPENDENCIES: Record<string, string[]> = {
  "trade-worker": ["d1-worker"],
  "agent-worker": ["d1-worker"],
  "email-worker": ["d1-worker"],
  "analytics-worker": ["d1-worker"],
  "web3-wallet-worker": ["d1-worker", "hoox"],
};

/**
 * Resolve transitive worker dependencies.
 * Returns a deduplicated array of all workers including dependencies.
 */
export function resolveDependencies(selected: string[]): string[] {
  const result = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const worker of [...result]) {
      const deps = WORKER_DEPENDENCIES[worker];
      if (deps) {
        for (const dep of deps) {
          if (!result.has(dep)) {
            result.add(dep);
            changed = true;
          }
        }
      }
    }
  }
  return [...result];
}

// ─── Integrations ─────────────────────────────────────────────────────

/**
 * All supported integrations.
 */
export const INTEGRATIONS: IntegratedService[] = [
  {
    key: "binance",
    label: "Binance Exchange",
    workerName: "trade-worker",
    secrets: {
      BINANCE_KEY_BINDING: "Binance API Key",
      BINANCE_SECRET_BINDING: "Binance API Secret",
    },
  },
  {
    key: "mexc",
    label: "MEXC Exchange",
    workerName: "trade-worker",
    secrets: {
      MEXC_KEY_BINDING: "MEXC API Key",
      MEXC_SECRET_BINDING: "MEXC API Secret",
    },
  },
  {
    key: "bybit",
    label: "Bybit Exchange",
    workerName: "trade-worker",
    secrets: {
      BYBIT_KEY_BINDING: "Bybit API Key",
      BYBIT_SECRET_BINDING: "Bybit API Secret",
    },
  },
  {
    key: "wallet",
    label: "Web3 Wallet (on-chain execution)",
    workerName: "web3-wallet-worker",
    secrets: {
      WALLET_MNEMONIC_SECRET: "Wallet Mnemonic Phrase",
      WALLET_PK_SECRET: "Wallet Private Key",
    },
  },
  {
    key: "email",
    label: "Email Signal Parsing",
    workerName: "email-worker",
    secrets: {
      INTERNAL_KEY_BINDING: "Internal Auth Key",
      EMAIL_HOST_BINDING: "Email Host (IMAP server)",
      EMAIL_USER_BINDING: "Email Username",
      EMAIL_PASS_BINDING: "Email Password",
    },
    vars: { USE_IMAP: "false" },
  },
  {
    key: "telegram",
    label: "Telegram Notifications",
    workerName: "telegram-worker",
    secrets: {
      TG_BOT_TOKEN_BINDING: "Telegram Bot Token",
    },
  },
  {
    key: "openai",
    label: "OpenAI (AI Agent)",
    workerName: "agent-worker",
    secrets: {
      AGENT_INTERNAL_KEY: "OpenAI API Key",
    },
  },
  {
    key: "anthropic",
    label: "Anthropic (AI Agent)",
    workerName: "agent-worker",
    secrets: {
      AGENT_INTERNAL_KEY: "Anthropic API Key",
    },
  },
  {
    key: "google-ai",
    label: "Google AI (AI Agent)",
    workerName: "agent-worker",
    secrets: {
      AGENT_INTERNAL_KEY: "Google AI API Key",
    },
  },
  {
    key: "home-assistant",
    label: "Home Assistant (Smart Home)",
    workerName: "hoox",
    secrets: {
      HA_TOKEN_BINDING: "Home Assistant Token",
    },
  },
];

// ─── Base Workers ─────────────────────────────────────────────────────

export const BASE_WORKERS: Record<
  string,
  { enabled: boolean; path: string; vars: Record<string, string> }
> = {
  "d1-worker": {
    enabled: true,
    path: "workers/d1-worker",
    vars: { database_name: "hoox-db" },
  },
  hoox: { enabled: true, path: "workers/hoox-worker", vars: {} },
  "agent-worker": { enabled: true, path: "workers/agent-worker", vars: {} },
  "analytics-worker": {
    enabled: true,
    path: "workers/analytics-worker",
    vars: {},
  },
};

/**
 * Base secrets for base workers (not integration-driven).
 */
export const BASE_SECRETS: Record<string, string[]> = {
  hoox: ["WEBHOOK_API_KEY_BINDING"],
  "agent-worker": ["AGENT_INTERNAL_KEY", "INTERNAL_KEY_BINDING"],
  "analytics-worker": ["CLOUDFLARE_API_TOKEN"],
};
