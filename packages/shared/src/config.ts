/**
 * Config — Read/write configuration files for the HOOX TUI.
 *
 * Reads from:
 *   1. Environment variables (HOOX_API_URL, HOOX_API_TOKEN)
 *   2. ~/.hoox/config.json (persisted user settings)
 *   3. Project-local .env file
 *
 * Writes use owner-only permissions (dir 0o700, file 0o600) because the file
 * may contain `apiToken` and other operator secrets.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOX_DIR = join(homedir(), ".hoox");
const CONFIG_PATH = join(HOX_DIR, "config.json");

/** Owner rwx only — config dir may hold secrets and certs. */
export const HOOX_DIR_MODE = 0o700;
/** Owner rw only — config.json may contain apiToken. */
export const HOOX_CONFIG_FILE_MODE = 0o600;

/** Operator transport stored in config (mirrors HOOX_TRANSPORT). */
export type HooxConfigTransport = "public" | "access" | "mtls" | "tunnel";

export interface HooxConfig {
  apiUrl: string;
  apiToken: string;
  /**
   * Operator transport preference for TUI/CLI remote sessions.
   * Env `HOOX_TRANSPORT` overrides this when set.
   */
  transport?: HooxConfigTransport;
  refreshIntervalMs: number;
  theme: "dark" | "light";
  activeExchanges: string[];
  notifications: {
    alerts: boolean;
    trades: boolean;
    debug: boolean;
    system: boolean;
  };
  soundEnabled: boolean;
  defaultView: string;
}

const DEFAULT_CONFIG: HooxConfig = {
  apiUrl: "http://localhost:8787",
  apiToken: "",
  transport: "public",
  refreshIntervalMs: 500,
  theme: "dark",
  activeExchanges: ["binance", "bybit", "mexc"],
  notifications: {
    alerts: true,
    trades: true,
    debug: false,
    system: true,
  },
  soundEnabled: true,
  defaultView: "dashboard",
};

/** Read config from disk, merging with defaults and env vars */
export function readConfigSync(): HooxConfig {
  const envConfig: Partial<HooxConfig> = {
    apiUrl: process.env.HOOX_API_URL,
    apiToken: process.env.HOOX_API_TOKEN,
  };

  let fileConfig: Partial<HooxConfig> = {};
  try {
    if (existsSync(CONFIG_PATH)) {
      fileConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {
    // Ignore parse errors, use defaults
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...Object.fromEntries(
      Object.entries(envConfig).filter(([_, v]) => v !== undefined)
    ),
  };
}

export async function readConfig(): Promise<HooxConfig> {
  return readConfigSync();
}

/**
 * Ensure `~/.hoox` exists with owner-only permissions.
 * Best-effort chmod on existing dirs (may fail on some FS / Windows).
 */
export function ensureHooxDirSecure(dir: string = HOX_DIR): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: HOOX_DIR_MODE });
  }
  try {
    chmodSync(dir, HOOX_DIR_MODE);
  } catch {
    // ignore — platform / mount may not support mode bits
  }
}

/**
 * Write a path with owner-only file mode (0o600).
 * Used by config writers and other secret-bearing files under ~/.hoox.
 */
export function writeSecureFileSync(
  filePath: string,
  contents: string,
  mode: number = HOOX_CONFIG_FILE_MODE
): void {
  writeFileSync(filePath, contents, { encoding: "utf-8", mode });
  try {
    chmodSync(filePath, mode);
  } catch {
    // ignore — some platforms ignore mode on writeFileSync
  }
}

/**
 * True when group or other have any access bits set (Unix permission triad).
 * Pure helper so tests do not depend on real filesystem after mock.module.
 */
export function isUnixModeGroupOrWorldAccessible(mode: number): boolean {
  return (mode & 0o077) !== 0;
}

/**
 * True when group or other have any access bits set (Unix).
 * Always false when the file is missing or mode is unavailable.
 */
export function isConfigWorldOrGroupReadable(
  filePath: string = CONFIG_PATH
): boolean {
  try {
    if (!existsSync(filePath)) return false;
    return isUnixModeGroupOrWorldAccessible(statSync(filePath).mode & 0o777);
  } catch {
    return false;
  }
}

/** Human-readable warning when config perms are too open. */
export function formatConfigPermissionWarning(
  filePath: string = CONFIG_PATH
): string | null {
  if (!isConfigWorldOrGroupReadable(filePath)) return null;
  return (
    `Warning: ${filePath} is group/world-accessible. ` +
    `Run: chmod 600 ${filePath}  (and chmod 700 on the parent dir). ` +
    `This file may contain apiToken / operator secrets.`
  );
}

/** Write config to disk with owner-only permissions. */
export function writeConfigSync(config: HooxConfig): void {
  try {
    ensureHooxDirSecure(HOX_DIR);
    writeSecureFileSync(
      CONFIG_PATH,
      JSON.stringify(config, null, 2),
      HOOX_CONFIG_FILE_MODE
    );
  } catch (err) {
    console.error("Failed to write config:", err);
  }
}

export async function writeConfig(config: HooxConfig): Promise<void> {
  writeConfigSync(config);
}

const VALID_TRANSPORTS = new Set<HooxConfigTransport>([
  "public",
  "access",
  "mtls",
  "tunnel",
]);

/** Validate config — returns array of error messages */
export function validateConfig(config: Partial<HooxConfig>): string[] {
  const errors: string[] = [];
  if (config.apiUrl && !config.apiUrl.startsWith("http")) {
    errors.push("apiUrl must start with http:// or https://");
  }
  if (
    config.refreshIntervalMs !== undefined &&
    config.refreshIntervalMs < 100
  ) {
    errors.push("refreshIntervalMs must be >= 100ms");
  }
  if (config.theme && !["dark", "light"].includes(config.theme)) {
    errors.push('theme must be "dark" or "light"');
  }
  if (
    config.transport !== undefined &&
    !VALID_TRANSPORTS.has(config.transport)
  ) {
    errors.push('transport must be "public" | "access" | "mtls" | "tunnel"');
  }
  return errors;
}
