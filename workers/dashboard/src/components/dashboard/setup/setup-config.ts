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
  | "External Webhooks"
  | "Internal Auth Keys"
  | "Exchange API Keys"
  | "Notification Services";

export interface RequiredSecret {
  group: SecretGroup;
  worker: string;
  secret: string;
  desc: string;
}

export interface SecretStatus extends RequiredSecret {
  configured: boolean;
  example: string;
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

// --- Required Secrets Catalog ---

export const REQUIRED_SECRETS: RequiredSecret[] = [
  {
    group: "External Webhooks",
    worker: "hoox",
    secret: "WEBHOOK_API_KEY_BINDING",
    desc: "For TradingView/External webhooks",
  },
  {
    group: "Internal Auth Keys",
    worker: "trade-worker",
    secret: "API_SERVICE_KEY_BINDING",
    desc: "Internal Auth Key",
  },
  {
    group: "Internal Auth Keys",
    worker: "telegram-worker",
    secret: "TELEGRAM_INTERNAL_KEY_BINDING",
    desc: "Internal Auth Key",
  },
  {
    group: "Internal Auth Keys",
    worker: "d1-worker",
    secret: "D1_READ_KEY_BINDING",
    desc: "D1 read-only internal key (fallback: D1_INTERNAL_KEY, INTERNAL_KEY_BINDING)",
  },
  {
    group: "Internal Auth Keys",
    worker: "trade-worker",
    secret: "TRADE_EXECUTE_KEY_BINDING",
    desc: "Trade execute internal key (fallback: TRADE_INTERNAL_KEY, INTERNAL_KEY_BINDING)",
  },
  {
    group: "Internal Auth Keys",
    worker: "agent-worker",
    secret: "AGENT_INTERNAL_KEY",
    desc: "Internal Auth Key",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "BINANCE_KEY_BINDING",
    desc: "Binance Exchange API Key",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "BINANCE_SECRET_BINDING",
    desc: "Binance Exchange Secret",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "MEXC_KEY_BINDING",
    desc: "MEXC Exchange API Key",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "MEXC_SECRET_BINDING",
    desc: "MEXC Exchange Secret",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "BYBIT_KEY_BINDING",
    desc: "Bybit Exchange API Key",
  },
  {
    group: "Exchange API Keys",
    worker: "trade-worker",
    secret: "BYBIT_SECRET_BINDING",
    desc: "Bybit Secret",
  },
  {
    group: "Notification Services",
    worker: "telegram-worker",
    secret: "TG_BOT_TOKEN_BINDING",
    desc: "Telegram Bot Token",
  },
  {
    group: "Internal Auth Keys",
    worker: "pyne-worker",
    secret: "API_KEY",
    desc: "Pine Script evaluation API key",
  },
  {
    group: "External Webhooks",
    worker: "email-worker",
    secret: "EMAIL_USER_BINDING",
    desc: "Email IMAP Username",
  },
  {
    group: "External Webhooks",
    worker: "email-worker",
    secret: "EMAIL_PASS_BINDING",
    desc: "Email IMAP Password",
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
    description: "Configure required API keys",
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

export function generateExampleSecret(secretName: string): string {
  const name = secretName.toLowerCase();
  if (
    name.includes("key") ||
    name.includes("token") ||
    name.includes("secret")
  ) {
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  }
  return "YOUR_SECRET_VALUE";
}

export function buildSecretCommand(
  secretName: string,
  workerName: string,
  exampleValue: string
): string {
  return `bun run scripts/manage.ts secrets update-cf ${secretName} ${workerName} "${exampleValue}"`;
}

export function groupSecretsByCategory(
  secrets: SecretStatus[]
): Record<SecretGroup, SecretStatus[]> {
  return secrets.reduce(
    (acc, secret) => {
      if (!acc[secret.group]) acc[secret.group] = [];
      acc[secret.group].push(secret);
      return acc;
    },
    {} as Record<SecretGroup, SecretStatus[]>
  );
}
