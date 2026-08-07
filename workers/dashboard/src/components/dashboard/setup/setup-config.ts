/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Sparkles,
  Server,
  KeyRound,
  Webhook,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

// --- Types ---

export type SecretGroup =
  | "Mesh (auto)"
  | "Exchange API Keys"
  | "Notifications"
  | "Integrations";

/** system = generated/synced by CLI; user = operator-supplied values */
export type SecretKind = "system" | "user";

export type SecretPriority = "critical" | "recommended" | "optional";

export interface RequiredSecret {
  group: SecretGroup;
  /** Worker key as used by `hoox secrets` (see root wrangler.jsonc `workers`) */
  worker: string;
  secret: string;
  desc: string;
  kind: SecretKind;
  priority: SecretPriority;
}

export interface SecretStatus extends RequiredSecret {
  configured: boolean;
}

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface HousekeepingCheckVM {
  service: string;
  status: "ok" | "error";
  detail: string;
}

// --- CLI command templates (must match packages/cli secrets + keys) ---

/** Generate mesh keys and push only system secrets to Cloudflare. */
export const MESH_AUTOMATE_COMMAND =
  "hoox keys generate && hoox secrets sync --system";

/** Inspect declared secrets / workers. */
export const SECRETS_LIST_COMMAND = "hoox secrets list";

/** Re-sync mesh keys only (after generate / rotation). */
export const MESH_SYNC_COMMAND = "hoox secrets sync --system";

/**
 * Names that `hoox keys generate` + `hoox secrets sync --system` cover.
 * Keep aligned with packages/cli SecretsService SYSTEM_SECRET_NAMES.
 */
export const SYSTEM_SECRET_NAMES = [
  "INTERNAL_KEY_BINDING",
  "AGENT_INTERNAL_KEY",
  "WEBHOOK_API_KEY_BINDING",
  "TELEGRAM_INTERNAL_KEY_BINDING",
  "SESSION_SECRET",
  "TRADE_INTERNAL_KEY",
  "API_SERVICE_KEY_BINDING",
] as const;

const SYSTEM_SECRET_SET = new Set<string>(SYSTEM_SECRET_NAMES);

export function isSystemSecret(name: string): boolean {
  return SYSTEM_SECRET_SET.has(name);
}

/** Secrets that gate “Next” on the secrets wizard step. */
export const CRITICAL_SECRET_NAMES = new Set<string>([
  "WEBHOOK_API_KEY_BINDING",
  "INTERNAL_KEY_BINDING",
  "API_SERVICE_KEY_BINDING",
]);

// --- Required Secrets Catalog ---

/**
 * Secrets surfaced in the setup wizard.
 * - Mesh secrets: one automation command covers all of them.
 * - User secrets: set interactively with `hoox secrets set <worker> <name>`.
 */
export const REQUIRED_SECRETS: RequiredSecret[] = [
  // Mesh — automated
  {
    group: "Mesh (auto)",
    worker: "hoox",
    secret: "WEBHOOK_API_KEY_BINDING",
    desc: "TradingView / external webhook auth on the public gateway",
    kind: "system",
    priority: "critical",
  },
  {
    group: "Mesh (auto)",
    worker: "agent-worker",
    secret: "INTERNAL_KEY_BINDING",
    desc: "Shared inter-worker mesh auth (all isolates)",
    kind: "system",
    priority: "critical",
  },
  {
    group: "Mesh (auto)",
    worker: "trade-worker",
    secret: "API_SERVICE_KEY_BINDING",
    desc: "Internal trade service key (alias of mesh key)",
    kind: "system",
    priority: "critical",
  },
  {
    group: "Mesh (auto)",
    worker: "agent-worker",
    secret: "AGENT_INTERNAL_KEY",
    desc: "Agent ↔ dashboard / mesh auth",
    kind: "system",
    priority: "recommended",
  },
  {
    group: "Mesh (auto)",
    worker: "trade-worker",
    secret: "TELEGRAM_INTERNAL_KEY_BINDING",
    desc: "Trade → telegram internal auth",
    kind: "system",
    priority: "recommended",
  },
  {
    group: "Mesh (auto)",
    worker: "dashboard",
    secret: "SESSION_SECRET",
    desc: "Dashboard session cookie signing",
    kind: "system",
    priority: "recommended",
  },
  {
    group: "Mesh (auto)",
    worker: "dashboard",
    secret: "TRADE_INTERNAL_KEY",
    desc: "Dashboard → trade execute auth",
    kind: "system",
    priority: "recommended",
  },

  // Exchanges — operator values
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "BINANCE_KEY_BINDING",
    desc: "Binance API key",
    kind: "user",
    priority: "recommended",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "BINANCE_SECRET_BINDING",
    desc: "Binance API secret",
    kind: "user",
    priority: "recommended",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "BYBIT_KEY_BINDING",
    desc: "Bybit API key",
    kind: "user",
    priority: "optional",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "BYBIT_SECRET_BINDING",
    desc: "Bybit API secret",
    kind: "user",
    priority: "optional",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "MEXC_KEY_BINDING",
    desc: "MEXC API key",
    kind: "user",
    priority: "optional",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "MEXC_SECRET_BINDING",
    desc: "MEXC API secret",
    kind: "user",
    priority: "optional",
  },

  // Notifications
  {
    group: "Notifications",
    worker: "telegram-worker",
    secret: "TG_BOT_TOKEN_BINDING",
    desc: "Telegram Bot API token",
    kind: "user",
    priority: "recommended",
  },

  // Other integrations
  {
    group: "Integrations",
    worker: "web3-wallet-worker",
    secret: "WALLET_PK_SECRET",
    desc: "EVM private key (Secrets Store) — optional if using mnemonic",
    kind: "user",
    priority: "optional",
  },
  {
    group: "Integrations",
    worker: "web3-wallet-worker",
    secret: "WALLET_MNEMONIC_SECRET",
    desc: "BIP-39 mnemonic (Secrets Store) — optional if using private key",
    kind: "user",
    priority: "optional",
  },
  {
    group: "Integrations",
    worker: "analytics-worker",
    secret: "CLOUDFLARE_API_TOKEN",
    desc: "Cloudflare API token for Analytics Engine SQL reads",
    kind: "user",
    priority: "optional",
  },
  {
    group: "Integrations",
    worker: "pyne-worker",
    secret: "API_KEY",
    desc: "PYNE edge evaluate auth (X-API-Key on /run and management APIs)",
    kind: "user",
    priority: "recommended",
  },
  {
    group: "Integrations",
    worker: "pyne-worker",
    secret: "ALERT_WEBHOOK_URL",
    desc: "Default HTTPS webhook for alert() / alertcondition() firings",
    kind: "user",
    priority: "optional",
  },
  {
    group: "Integrations",
    worker: "dashboard",
    secret: "PYNE_API_KEY",
    desc: "Dashboard → pyne-worker auth (same value as pyne-worker API_KEY)",
    kind: "user",
    priority: "optional",
  },
];

// --- Wizard Steps ---

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: "welcome",
    title: "Welcome",
    description: "Get introduced to Hoox",
    icon: Sparkles,
  },
  {
    id: "workers",
    title: "Workers",
    description: "Verify edge deployment",
    icon: Server,
  },
  {
    id: "secrets",
    title: "Secrets",
    description: "Automate mesh keys, then set integrations",
    icon: KeyRound,
  },
  {
    id: "webhook",
    title: "Webhook",
    description: "Connect TradingView alerts",
    icon: Webhook,
  },
  {
    id: "done",
    title: "Done",
    description: "You're ready to trade",
    icon: CheckCircle2,
  },
];

// --- Helpers ---

/**
 * CLI command to set a user-supplied secret (interactive prompt — no value in the shell).
 */
export function buildSecretSetCommand(
  workerName: string,
  secretName: string
): string {
  return `hoox secrets set ${workerName} ${secretName}`;
}

/**
 * Command shown for a secret row.
 * System secrets point at the one-shot mesh automation flow.
 */
export function buildSecretCommand(
  secretName: string,
  workerName: string,
  _exampleValue?: string
): string {
  if (isSystemSecret(secretName)) {
    return MESH_AUTOMATE_COMMAND;
  }
  return buildSecretSetCommand(workerName, secretName);
}

/** @deprecated Prefer buildSecretSetCommand / MESH_AUTOMATE_COMMAND */
export function generateExampleSecret(_secretName: string): string {
  return "";
}

export function groupSecretsByCategory(
  secrets: SecretStatus[]
): Partial<Record<SecretGroup, SecretStatus[]>> {
  return secrets.reduce(
    (acc, secret) => {
      if (!acc[secret.group]) acc[secret.group] = [];
      acc[secret.group]!.push(secret);
      return acc;
    },
    {} as Partial<Record<SecretGroup, SecretStatus[]>>
  );
}

export function systemSecrets(list: SecretStatus[]): SecretStatus[] {
  return list.filter((s) => s.kind === "system");
}

export function userSecrets(list: SecretStatus[]): SecretStatus[] {
  return list.filter((s) => s.kind === "user");
}
