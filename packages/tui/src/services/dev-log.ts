/**
 * TUI dev logger — file-backed diagnostics that never touch stdout/stderr
 * (those would corrupt the OpenTUI alternate screen).
 *
 * Enable with any of:
 *   - `hoox tui --debug`
 *   - `HOOX_DEBUG=1` / `TUI_DEBUG=1` / `true` / `yes`
 *
 * Writes append-only JSON lines to `$HOME/.hoox/.tui-state/debug.log`.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getTuiStateDir } from "./hoox-path-service";

export type DevLogLevel = "debug" | "info" | "warn" | "error";

export interface DevLogEntry {
  ts: string;
  level: DevLogLevel;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
}

const DEBUG_LOG_FILE = "debug.log";

let enabledCache: boolean | null = null;
let logPathCache: string | null = null;
let ensureDirPromise: Promise<string> | null = null;

/** Reset caches (tests only). */
export function resetDevLogForTests(): void {
  enabledCache = null;
  logPathCache = null;
  ensureDirPromise = null;
}

/**
 * Whether dev logging is active for this process.
 * Cached after first read so hot paths stay cheap.
 */
export function isDevLogEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  const v = process.env.HOOX_DEBUG ?? process.env.TUI_DEBUG ?? "";
  enabledCache = v === "1" || v === "true" || v === "yes";
  return enabledCache;
}

/** Absolute path to the debug log file (even if logging is disabled). */
export function getDevLogPath(): string {
  if (logPathCache) return logPathCache;
  logPathCache = join(getTuiStateDir(), DEBUG_LOG_FILE);
  return logPathCache;
}

async function ensureLogDir(): Promise<string> {
  if (!ensureDirPromise) {
    const dir = getTuiStateDir();
    ensureDirPromise = mkdir(dir, { recursive: true }).then(() => dir);
  }
  return ensureDirPromise;
}

/** Keys that almost always carry credentials or private material. */
const SECRET_KEY_RE =
  /token|secret|password|passwd|authorization|api[_-]?key|private[_-]?key|client[_-]?secret|access[_-]?client|credential|cookie|session/i;

/**
 * Redact secret-looking keys in structured context (nested objects included).
 * Exported for unit tests.
 */
export function redactDevLogContext(
  context?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  return redactValue(context) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecretsInText(value.message),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (child === undefined) continue;
      if (SECRET_KEY_RE.test(key)) {
        out[key] =
          typeof child === "string" && child.length > 0
            ? "[redacted]"
            : child === null
              ? null
              : typeof child === "object"
                ? "[redacted]"
                : child;
        continue;
      }
      out[key] = redactValue(child);
    }
    return out;
  }
  if (typeof value === "string") {
    return redactSecretsInText(value);
  }
  return value;
}

/**
 * Scrub common secret patterns that leak into free-form log messages.
 * Exported for unit tests.
 */
export function redactSecretsInText(text: string): string {
  let out = text;
  // Bearer tokens in Authorization headers or prose
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]{8,}/gi, "$1[redacted]");
  // Common env-style assignments
  out = out.replace(
    /\b(HOOX_API_TOKEN|CLOUDFLARE_API_TOKEN|CF_ACCESS_CLIENT_SECRET|CF_ACCESS_CLIENT_ID|OPERATOR_API_KEY|INTERNAL_API_KEY|INTERNAL_KEY_BINDING)\s*[=:]\s*\S+/gi,
    "$1=[redacted]"
  );
  // Authorization: <scheme> <value>
  out = out.replace(/(Authorization\s*:\s*)\S+/gi, "$1[redacted]");
  return out;
}

function serializeContext(
  context?: Record<string, unknown>
): Record<string, unknown> | undefined {
  return redactDevLogContext(context);
}

/**
 * Append one structured log line. No-op when debug is disabled.
 * Failures are swallowed — logging must never crash the TUI.
 */
export async function devLog(
  level: DevLogLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  if (!isDevLogEnabled()) return;

  const entry: DevLogEntry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message: redactSecretsInText(message),
    ...(context ? { context: serializeContext(context) } : {}),
  };

  try {
    await ensureLogDir();
    await appendFile(getDevLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Swallow — alternate-screen UI must stay intact
  }
}

/** Convenience helpers. */
export const tuiDevLog = {
  debug: (scope: string, message: string, context?: Record<string, unknown>) =>
    devLog("debug", scope, message, context),
  info: (scope: string, message: string, context?: Record<string, unknown>) =>
    devLog("info", scope, message, context),
  warn: (scope: string, message: string, context?: Record<string, unknown>) =>
    devLog("warn", scope, message, context),
  error: (scope: string, message: string, context?: Record<string, unknown>) =>
    devLog("error", scope, message, context),
};
