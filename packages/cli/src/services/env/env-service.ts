/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EnvVarDefinition {
  name: string;
  required: boolean;
  secret: boolean;
  section: string;
  default?: string;
  hint?: string;
  /** Auto-generate a random hex value instead of prompting during `env init`. */
  autoGenerate?: boolean;
  /** Byte length for auto-generated keys (default: 32 → 64 hex chars). */
  autoGenerateBytes?: number;
}

/** A .env file with its path and parsed variables. */
export interface EnvFile {
  path: string;
  vars: Record<string, string>;
}

export interface EnvValidationResult {
  missing: string[];
  warnings: string[];
}

export class EnvService {
  static getDefinitions(): EnvVarDefinition[] {
    return [
      {
        name: "CLOUDFLARE_API_TOKEN",
        required: true,
        secret: true,
        section: "Cloudflare Account",
        hint: "API token with Workers/KV/D1/R2 permissions",
      },
      {
        name: "CLOUDFLARE_ACCOUNT_ID",
        required: true,
        secret: false,
        section: "Cloudflare Account",
        hint: "From Cloudflare dashboard URL",
      },
      {
        name: "CLOUDFLARE_SECRET_STORE_ID",
        required: false,
        secret: false,
        section: "Cloudflare Account",
        default: "",
        hint: "Optional",
      },
      {
        name: "SUBDOMAIN_PREFIX",
        required: true,
        secret: false,
        section: "Cloudflare Account",
        default: "cryptolinx",
        hint: "Prefix for worker URLs",
      },
      {
        name: "TRADE_INTERNAL_KEY",
        required: true,
        secret: true,
        section: "Internal Auth",
        hint: "Internal key for trade worker auth",
        autoGenerate: true,
      },
      {
        name: "AGENT_INTERNAL_KEY",
        required: true,
        secret: true,
        section: "Internal Auth",
        hint: "Internal key for agent worker auth",
        autoGenerate: true,
      },
      {
        name: "WEBHOOK_API_KEY_BINDING",
        required: true,
        secret: true,
        section: "Internal Auth",
        hint: "Webhook auth key for hoox gateway",
        autoGenerate: true,
      },
      {
        name: "INTERNAL_KEY_BINDING",
        required: true,
        secret: true,
        section: "Internal Auth",
        hint: "Shared internal auth key for inter-worker communication",
        autoGenerate: true,
      },
      {
        name: "API_SERVICE_KEY_BINDING",
        required: true,
        secret: true,
        section: "Internal Auth",
        hint: "API service key for trade-worker",
        autoGenerate: true,
      },
      {
        name: "TELEGRAM_INTERNAL_KEY_BINDING",
        required: true,
        secret: true,
        section: "Internal Auth",
        hint: "Internal key for telegram worker auth",
        autoGenerate: true,
      },
      {
        name: "HA_TOKEN_BINDING",
        required: false,
        secret: true,
        section: "Internal Auth",
        hint: "Home Assistant token for hoox",
      },
      {
        name: "TG_BOT_TOKEN_BINDING",
        required: false,
        secret: true,
        section: "Telegram",
        hint: "From @BotFather",
      },
      {
        name: "TELEGRAM_SECRET_TOKEN",
        required: false,
        secret: true,
        section: "Telegram",
        hint: "Telegram webhook secret token",
      },
      // AI provider keys consolidated into AGENT_INTERNAL_KEY (above)
      {
        name: "BINANCE_KEY_BINDING",
        required: false,
        secret: true,
        section: "Exchanges",
        hint: "Binance API key",
      },
      {
        name: "BINANCE_SECRET_BINDING",
        required: false,
        secret: true,
        section: "Exchanges",
        hint: "Binance API secret",
      },
      {
        name: "MEXC_KEY_BINDING",
        required: false,
        secret: true,
        section: "Exchanges",
        hint: "MEXC API key",
      },
      {
        name: "MEXC_SECRET_BINDING",
        required: false,
        secret: true,
        section: "Exchanges",
        hint: "MEXC API secret",
      },
      {
        name: "BYBIT_KEY_BINDING",
        required: false,
        secret: true,
        section: "Exchanges",
        hint: "Bybit API key",
      },
      {
        name: "BYBIT_SECRET_BINDING",
        required: false,
        secret: true,
        section: "Exchanges",
        hint: "Bybit API secret",
      },
      // Email
      {
        name: "EMAIL_HOST_BINDING",
        required: false,
        secret: true,
        section: "Email",
        hint: "Email IMAP server host",
      },
      {
        name: "EMAIL_USER_BINDING",
        required: false,
        secret: true,
        section: "Email",
        hint: "Email IMAP username",
      },
      {
        name: "EMAIL_PASS_BINDING",
        required: false,
        secret: true,
        section: "Email",
        hint: "Email IMAP password",
      },
      // INTERNAL_KEY_BINDING consolidated into INTERNAL_KEY_BINDING (above)
      // Wallet
      {
        name: "WALLET_MNEMONIC_SECRET",
        required: false,
        secret: true,
        section: "Wallet",
        hint: "Wallet mnemonic phrase for web3-wallet-worker",
      },
      {
        name: "WALLET_PK_SECRET",
        required: false,
        secret: true,
        section: "Wallet",
        hint: "Wallet private key for web3-wallet-worker",
      },
      // PYNE edge evaluate
      {
        name: "API_KEY",
        required: false,
        secret: true,
        section: "PYNE",
        hint: "pyne-worker X-API-Key for /run and management APIs",
      },
      {
        name: "ALERT_WEBHOOK_URL",
        required: false,
        secret: true,
        section: "PYNE",
        hint: "Default alert() / alertcondition() webhook URL",
      },
      {
        name: "PYNE_API_KEY",
        required: false,
        secret: true,
        section: "PYNE",
        hint: "Dashboard → pyne-worker auth (same value as API_KEY)",
      },
      {
        name: "PYNE_WORKER_URL",
        required: false,
        secret: false,
        section: "PYNE",
        default: "https://pyne-worker.cryptolinx.workers.dev",
        hint: "Public base URL for pyne-worker (hoox pyne / dashboard)",
      },
      {
        name: "DASHBOARD_USER",
        required: true,
        secret: false,
        section: "Dashboard",
        default: "admin",
        hint: "Dashboard login username",
      },
      {
        name: "DASHBOARD_PASS",
        required: true,
        secret: true,
        section: "Dashboard",
        hint: "Dashboard login password",
      },
      {
        name: "SESSION_SECRET",
        required: true,
        secret: true,
        section: "Dashboard",
        hint: "32+ char random string for session signing",
        autoGenerate: true,
        autoGenerateBytes: 64,
      },
    ];
  }

  static getSections(): string[] {
    return [...new Set(EnvService.getDefinitions().map((d) => d.section))];
  }

  /** Generate a cryptographically random hex string. */
  static generateKey(bytes = 32): string {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  static async loadDotEnvAsync(
    filePath: string
  ): Promise<Record<string, string>> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return {};
    const text = await file.text();
    const vars: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
    return vars;
  }

  static validate(vars: Record<string, string>): EnvValidationResult {
    const missing: string[] = [];
    const warnings: string[] = [];
    for (const def of EnvService.getDefinitions()) {
      if (def.required) {
        const val = vars[def.name];
        if (!val || val.startsWith("your_") || val.startsWith("generate_")) {
          missing.push(def.name);
        }
      }
    }
    if (vars.SESSION_SECRET && vars.SESSION_SECRET.length < 32) {
      warnings.push("SESSION_SECRET should be at least 32 characters");
    }
    return { missing, warnings };
  }

  static generateEnvLocal(vars?: Record<string, string>): string {
    const v = vars ?? {};
    const defs = EnvService.getDefinitions();
    const sections = EnvService.getSections();
    let output =
      "# Hoox Local Environment Configuration\n# Generated by `hoox config env init`.\n# NEVER commit this file.\n\n";
    for (const section of sections) {
      output += `# --- ${section.toUpperCase()} ---\n`;
      for (const def of defs.filter((d) => d.section === section)) {
        const val =
          v[def.name] !== undefined
            ? v[def.name]
            : (def.default ?? `your_${def.name.toLowerCase()}`);
        output += `${def.name}="${val}"\n`;
      }
      output += "\n";
    }
    return output;
  }

  static getWorkerDevVars(
    vars: Record<string, string>
  ): Record<string, Record<string, string>> {
    const workerMap: Record<string, string[]> = {
      "workers/hoox-worker": [
        "WEBHOOK_API_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
        "HA_TOKEN_BINDING",
      ],
      "workers/trade-worker": [
        "API_SERVICE_KEY_BINDING",
        "INTERNAL_KEY_BINDING",
        "BINANCE_KEY_BINDING",
        "BINANCE_SECRET_BINDING",
        "MEXC_KEY_BINDING",
        "MEXC_SECRET_BINDING",
        "BYBIT_KEY_BINDING",
        "BYBIT_SECRET_BINDING",
      ],
      "workers/agent-worker": ["AGENT_INTERNAL_KEY"],
      "workers/d1-worker": ["INTERNAL_KEY_BINDING"],
      "workers/telegram-worker": [
        "TG_BOT_TOKEN_BINDING",
        "TELEGRAM_SECRET_TOKEN",
      ],
      "workers/web3-wallet-worker": [
        "WALLET_MNEMONIC_SECRET",
        "WALLET_PK_SECRET",
      ],
      "workers/email-worker": [
        "EMAIL_HOST_BINDING",
        "EMAIL_USER_BINDING",
        "EMAIL_PASS_BINDING",
        "INTERNAL_KEY_BINDING",
      ],
      "workers/analytics-worker": ["CLOUDFLARE_API_TOKEN"],
      "workers/pyne-worker": ["API_KEY", "ALERT_WEBHOOK_URL"],
      "workers/dashboard": [
        "DASHBOARD_USER",
        "DASHBOARD_PASS",
        "SESSION_SECRET",
        "INTERNAL_KEY_BINDING",
        "AGENT_INTERNAL_KEY",
        "TRADE_INTERNAL_KEY",
        "TELEGRAM_INTERNAL_KEY_BINDING",
        "API_SERVICE_KEY_BINDING",
        "PYNE_API_KEY",
      ],
    };
    const result: Record<string, Record<string, string>> = {};
    for (const [workerPath, varNames] of Object.entries(workerMap)) {
      const workerVars: Record<string, string> = {};
      for (const name of varNames) {
        if (vars[name] !== undefined && vars[name] !== "") {
          workerVars[name] = vars[name];
        }
      }
      if (Object.keys(workerVars).length > 0) result[workerPath] = workerVars;
    }
    return result;
  }

  static show(vars: Record<string, string>): string {
    const defs = EnvService.getDefinitions();
    const sections = EnvService.getSections();
    let output = "";
    for (const section of sections) {
      output += `\n${section}:\n`;
      for (const def of defs.filter((d) => d.section === section)) {
        const val = vars[def.name];
        const displayVal =
          def.secret && val ? "********" : (val ?? "(not set)");
        const status = val ? " [set]" : " [missing]";
        output += `  ${def.name}=${displayVal}${def.secret ? " (secret)" : ""}${status}\n`;
      }
    }
    return output;
  }
}
