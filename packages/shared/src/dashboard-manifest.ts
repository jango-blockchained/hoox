/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dashboard settings manifests — same shape as workers/NAME/dashboard.jsonc
 * (and the web dashboard Settings form).
 *
 * Pure parse + field helpers so CLI, TUI, and web share one source of truth
 * for structure. Filesystem loaders are Node/Bun only (same as path-utils).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type DashboardFieldType =
  | "boolean"
  | "number"
  | "text"
  | "select"
  | "json"
  | "textarea";

export type DashboardFieldKind = "normal" | "dangerous" | "secret";

export interface DashboardFieldOption {
  value: string;
  label: string;
}

export interface DashboardSettingField {
  /** Composite key: `sectionId:fieldName` (matches web dashboard) */
  key: string;
  label: string;
  description?: string;
  type: DashboardFieldType;
  default: string | number | boolean;
  options?: DashboardFieldOption[];
  kind?: DashboardFieldKind;
  cliCommand?: string;
  /** Optional bounds/pattern (e.g. cron interval_minutes min 1 max 1440). */
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
  };
}

export interface DashboardSection {
  id: string;
  title: string;
  description: string;
  icon?: string;
  priority: number;
  fields: DashboardSettingField[];
}

export interface WorkerDashboardManifest {
  worker: string;
  displayName: string;
  description?: string;
  sections: DashboardSection[];
}

/** Worker name → default CONFIG_KV prefix (web dashboard prefixes.ts). */
export const DASHBOARD_WORKER_PREFIX: Record<string, string> = {
  hoox: "global:",
  "trade-worker": "trade:",
  "agent-worker": "agent:",
  "telegram-worker": "bot:",
  "d1-worker": "database:",
  "email-worker": "email:",
  "web3-wallet-worker": "wallet:",
  "analytics-worker": "ai:",
  "report-worker": "report:",
  "pyne-worker": "pyne:",
};

/** Section id → CONFIG_KV prefix (must stay in sync with web SECTION_PREFIX_MAP). */
export const DASHBOARD_SECTION_PREFIX: Record<string, string> = {
  global: "global:",
  webhook: "webhook:",
  routing: "routing:",
  security: "webhook:",
  trade: "trade:",
  agent: "agent:",
  bot: "bot:",
  email: "email:",
  /** Email worker dashboard uses section id `signal` for parse patterns. */
  signal: "email:",
  database: "database:",
  retention: "retention:",
  cron: "cron:",
  behavior: "behavior:",
  /**
   * Agent risk limits are stored under trade:* (same keys workers read:
   * trade:kill_switch, trade:trailing_stop_percent, …).
   */
  risk: "trade:",
  exchanges: "trade:",
  fees: "trade:",
  providers: "agent:",
  models: "agent:",
  ai: "ai:",
  report: "report:",
  pyne: "pyne:",
  pyne_alerts: "pyne:",
};

/**
 * Composite field keys (`section:field`) → exact CONFIG_KV keys when the
 * section prefix + field name would not match what workers read.
 *
 * Prefer fixing dashboard.jsonc field names when possible; use this for
 * nested paths (e.g. webhook:tradingview:…) and exchange enable flags.
 */
export const DASHBOARD_FIELD_KV_OVERRIDES: Record<string, string> = {
  "webhook:tradingview_ip_check_enabled":
    "webhook:tradingview:ip_check_enabled",
  "webhook:tradingview_allowed_ips": "webhook:tradingview:allowed_ips",
  "exchanges:binance_enabled": "exchange:binance:enabled",
  "exchanges:mexc_enabled": "exchange:mexc:enabled",
  "exchanges:bybit_enabled": "exchange:bybit:enabled",
};

/**
 * Section ids that must not appear as flat CONFIG_KV keys in apply-manifest.
 *
 * - providers/models: edited via `agent:config` (see agent-config-fields.ts)
 * - cron: wrangler trigger schedule, not KV
 * - behavior: not read as flat behavior:* keys by the agent worker
 */
export const DASHBOARD_SECTIONS_NOT_FLAT_KV: ReadonlySet<string> = new Set([
  "providers",
  "models",
  "cron",
  "behavior",
]);

/**
 * Sections that are not editable as flat or agent:config fields
 * (no worker consumer yet).
 */
export const DASHBOARD_SECTIONS_UI_SKIP: ReadonlySet<string> = new Set([
  "cron",
  "behavior",
]);

/** True when a section should map to flat CONFIG_KV get/set / apply-manifest. */
export function isDashboardSectionFlatKv(sectionId: string): boolean {
  return !DASHBOARD_SECTIONS_NOT_FLAT_KV.has(sectionId);
}

/**
 * True when the section can be shown/edited in TUI/web worker settings.
 * Includes agent:config-backed sections (providers/models) and flat KV.
 */
export function isDashboardSectionEditable(sectionId: string): boolean {
  return !DASHBOARD_SECTIONS_UI_SKIP.has(sectionId);
}

/**
 * Build CONFIG_KV key from worker + composite field key (`section:field`).
 * Aligns with workers/dashboard prefixes + worker-facing keys in kvKeys.ts.
 *
 * Unknown sections keep `section:field` (namespaced) so bare keys like
 * `kill_switch` are not written by accident. Mapped sections (including
 * risk → trade:, signal → email:) produce worker-readable keys.
 */
export function buildDashboardKvKey(worker: string, fieldKey: string): string {
  const override = DASHBOARD_FIELD_KV_OVERRIDES[fieldKey];
  if (override) return override;

  if (fieldKey.includes(":")) {
    const [section, ...rest] = fieldKey.split(":");
    const fieldName = rest.join(":");
    // exchanges:binance_enabled → exchange:binance:enabled (generic pattern)
    if (section === "exchanges" && fieldName.endsWith("_enabled")) {
      const exchange = fieldName.slice(0, -"_enabled".length);
      if (exchange) return `exchange:${exchange}:enabled`;
    }
    const mapped = DASHBOARD_SECTION_PREFIX[section ?? ""];
    if (mapped) return `${mapped}${fieldName}`;
    // Unknown section id → keep section as namespace (safer than bare name)
    return `${section}:${fieldName}`;
  }
  const workerPrefix = DASHBOARD_WORKER_PREFIX[worker] ?? "";
  return `${workerPrefix}${fieldKey}`;
}

/** Strip line and block comments plus trailing commas (JSONC). */
export function stripJsonc(input: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let stringChar = "";
  while (i < input.length) {
    const c = input[i];
    const next = input[i + 1];
    if (inString) {
      out += c;
      if (c === "\\" && i + 1 < input.length) {
        out += next;
        i += 2;
        continue;
      }
      if (c === stringChar) inString = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/"))
        i++;
      i += 2;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j]!)) j++;
      if (j < input.length && (input[j] === "}" || input[j] === "]")) {
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

function parseFieldType(value: string | number | boolean): DashboardFieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value === "true" || value === "false") return "boolean";
  if (value.trim().startsWith("{") || value.trim().startsWith("["))
    return "json";
  if (!Number.isNaN(Number(value)) && value.trim() !== "") return "number";
  return "text";
}

function labelFromKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface RawSection {
  title?: string;
  description?: string;
  icon?: string;
  priority?: number;
  fields?: Record<string, string | number | boolean>;
  options?: Record<string, Array<string | number>>;
  descriptions?: Record<string, string>;
  validation?: Record<
    string,
    { min?: number; max?: number; pattern?: string; required?: boolean }
  >;
  secrets?: Record<string, boolean>;
  secret_commands?: Record<string, string>;
}

interface RawManifest {
  display_name?: string;
  displayName?: string;
  description?: string;
  sections?: Record<string, RawSection>;
}

/**
 * Parse dashboard.jsonc content into a worker settings manifest.
 *
 * On parse/schema failure returns an empty-sections stub and optionally
 * reports via `onError` (CLI/TUI should log; silent empty used to hide
 * broken manifests from discovery).
 */
export function parseDashboardManifest(
  content: string,
  workerName: string,
  onError?: (message: string) => void
): WorkerDashboardManifest {
  try {
    const raw = JSON.parse(stripJsonc(content)) as RawManifest;
    const displayName = raw.display_name || raw.displayName || workerName;
    const description = raw.description || "";
    const sections: DashboardSection[] = [];

    if (raw.sections) {
      for (const [sectionId, sectionData] of Object.entries(raw.sections)) {
        const fields: DashboardSettingField[] = [];
        const sectionFields = sectionData.fields || {};
        const sectionOptions = sectionData.options || {};
        const sectionDescriptions = sectionData.descriptions || {};
        const sectionValidation = sectionData.validation || {};
        const sectionSecrets = sectionData.secrets || {};
        const sectionSecretCommands = sectionData.secret_commands || {};

        for (const [key, value] of Object.entries(sectionFields)) {
          const field: DashboardSettingField = {
            key: `${sectionId}:${key}`,
            label: labelFromKey(key),
            type: parseFieldType(value),
            default: value,
          };

          if (sectionOptions[key]) {
            field.type = "select";
            field.options = sectionOptions[key].map((opt) => ({
              value: String(opt),
              label: String(opt),
            }));
          }

          if (sectionDescriptions[key]) {
            field.description = String(sectionDescriptions[key]);
          }

          if (sectionValidation[key]) {
            field.validation = sectionValidation[key];
          }

          if (sectionSecrets[key]) {
            field.kind = "secret";
            field.cliCommand = sectionSecretCommands[key];
          }

          // kill_switch and similar flags — treat as dangerous when name matches
          if (
            key.includes("kill_switch") ||
            key.includes("drawdown") ||
            (key === "enabled" && sectionId === "global")
          ) {
            if (field.kind !== "secret") field.kind = "dangerous";
          }

          fields.push(field);
        }

        sections.push({
          id: sectionId,
          title: sectionData.title || labelFromKey(sectionId),
          description:
            sectionData.description || `Configure ${sectionId} settings`,
          icon: sectionData.icon,
          priority:
            sectionData.priority !== undefined
              ? sectionData.priority
              : sections.length * 10,
          fields,
        });
      }
    }

    return {
      worker: workerName,
      displayName,
      description,
      sections: sections.sort((a, b) => a.priority - b.priority),
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : `parse failed: ${String(err)}`;
    onError?.(`dashboard.jsonc for ${workerName}: ${message}`);
    return {
      worker: workerName,
      displayName: workerName,
      description: "Failed to load configuration",
      sections: [],
    };
  }
}

/** Canonical worker list used by the web settings form. */
export const DASHBOARD_WORKER_IDS = [
  "hoox",
  "trade-worker",
  "agent-worker",
  "telegram-worker",
  "d1-worker",
  "email-worker",
  "web3-wallet-worker",
  "analytics-worker",
  "report-worker",
  "pyne-worker",
] as const;

export type DashboardWorkerId = (typeof DASHBOARD_WORKER_IDS)[number];

/**
 * Map worker id used in dashboard.jsonc / UI to filesystem folder name.
 * Gateway settings live under workers/hoox-worker/dashboard.jsonc.
 */
export function dashboardWorkerDir(workerId: string): string {
  if (workerId === "hoox") return "hoox-worker";
  return workerId;
}

/** Flat CONFIG_KV key definition derived from dashboard manifests. */
export interface DashboardKvManifestKey {
  key: string;
  type: "boolean" | "number" | "string";
  default: string;
  description: string;
  secret?: boolean;
  /** Source worker id (e.g. hoox, trade-worker) */
  worker?: string;
}

export interface DashboardKvManifest {
  namespace: string;
  keys: DashboardKvManifestKey[];
}

function fieldTypeToKv(t: DashboardFieldType): "boolean" | "number" | "string" {
  if (t === "boolean") return "boolean";
  if (t === "number") return "number";
  return "string";
}

function defaultToString(value: string | number | boolean): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Skip pseudo-fields that are API docs, not real KV keys. */
function isDocumentationField(fieldKey: string): boolean {
  const name = fieldKey.includes(":")
    ? fieldKey.slice(fieldKey.indexOf(":") + 1)
    : fieldKey;
  return /^(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(name);
}

/**
 * Flatten worker dashboard manifests into a CONFIG_KV key list
 * (for `hoox config kv manifest` / apply-manifest).
 *
 * First definition wins for duplicate keys (worker order follows
 * `DASHBOARD_WORKER_IDS` then filesystem discovery). Prefer richer
 * description/secret when a later duplicate is more complete.
 */
export function kvManifestFromDashboardManifests(
  manifests: WorkerDashboardManifest[]
): DashboardKvManifest {
  const byKey = new Map<string, DashboardKvManifestKey>();

  for (const manifest of manifests) {
    for (const section of manifest.sections) {
      if (!isDashboardSectionFlatKv(section.id)) continue;
      for (const field of section.fields) {
        if (isDocumentationField(field.key)) continue;
        const key = buildDashboardKvKey(manifest.worker, field.key);
        if (!key || key.endsWith(":")) continue;
        const next: DashboardKvManifestKey = {
          key,
          type: fieldTypeToKv(field.type),
          default: defaultToString(field.default),
          description:
            field.description || `${manifest.displayName}: ${field.label}`,
          secret: field.kind === "secret" ? true : undefined,
          worker: manifest.worker,
        };
        const prev = byKey.get(key);
        if (!prev) {
          byKey.set(key, next);
          continue;
        }
        // Enrich first-wins entry when later source has secret/description
        if (!prev.secret && next.secret) prev.secret = true;
        if (
          (!prev.description || prev.description.length < 8) &&
          next.description
        ) {
          prev.description = next.description;
        }
      }
    }
  }

  const keys = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  return { namespace: "CONFIG_KV", keys };
}

/**
 * Load dashboard.jsonc files from a monorepo root and build the KV manifest.
 * Pure filesystem helper used by CLI; returns empty keys if root missing.
 */
export function loadDashboardKvManifestFromRoot(
  root: string,
  onError?: (message: string) => void
): DashboardKvManifest {
  return kvManifestFromDashboardManifests(
    loadDashboardManifestsFromRoot(root, onError)
  );
}

function tryReadFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Discover workers/NAME/dashboard.jsonc under a monorepo root.
 * Broken JSONC files are skipped (empty sections) after `onError` warning.
 */
export function loadDashboardManifestsFromRoot(
  root: string,
  onError?: (message: string) => void
): WorkerDashboardManifest[] {
  const manifests: WorkerDashboardManifest[] = [];
  const seen = new Set<string>();
  const workersDir = join(root, "workers");
  if (!existsSync(workersDir)) return manifests;

  const warn =
    onError ??
    ((message: string) => {
      // Default: surface parse failures so CLI/TUI do not silently drop files
      console.warn(`[dashboard-manifest] ${message}`);
    });

  for (const workerId of DASHBOARD_WORKER_IDS) {
    const dir = dashboardWorkerDir(workerId);
    const path = join(workersDir, dir, "dashboard.jsonc");
    const content = tryReadFile(path);
    if (!content) continue;
    const m = parseDashboardManifest(content, workerId, warn);
    if (m.sections.length > 0) {
      manifests.push(m);
      seen.add(workerId);
    } else if (m.description === "Failed to load configuration") {
      // already reported via onError
    }
  }

  try {
    for (const entry of readdirSync(workersDir)) {
      if (entry === "dashboard") continue;
      const workerId =
        entry === "hoox-worker" || entry === "hoox" ? "hoox" : entry;
      if (seen.has(workerId)) continue;
      const path = join(workersDir, entry, "dashboard.jsonc");
      const content = tryReadFile(path);
      if (!content) continue;
      const m = parseDashboardManifest(content, workerId, warn);
      if (m.sections.length > 0) {
        manifests.push(m);
        seen.add(workerId);
      }
    }
  } catch {
    /* ignore */
  }

  // Fallback: synced public copies
  const publicDir = join(workersDir, "dashboard", "public", "workers");
  if (existsSync(publicDir)) {
    try {
      for (const file of readdirSync(publicDir)) {
        if (!file.endsWith(".jsonc") && !file.endsWith(".json")) continue;
        const base = file.replace(/\.jsonc?$/, "");
        const workerId =
          base === "hoox-worker" || base === "hoox" ? "hoox" : base;
        if (seen.has(workerId)) continue;
        const content = tryReadFile(join(publicDir, file));
        if (!content) continue;
        const m = parseDashboardManifest(content, workerId, warn);
        if (m.sections.length > 0) {
          manifests.push(m);
          seen.add(workerId);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return manifests;
}
