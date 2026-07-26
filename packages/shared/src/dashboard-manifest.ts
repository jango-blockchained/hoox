/**
 * Dashboard settings manifests — same shape as workers/NAME/dashboard.jsonc
 * (and the web dashboard Settings form).
 *
 * Pure parse + field helpers so CLI, TUI, and web share one source of truth
 * for structure. Loading files from disk stays in the consumer.
 */

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
};

/** Section id → CONFIG_KV prefix. */
export const DASHBOARD_SECTION_PREFIX: Record<string, string> = {
  global: "global:",
  webhook: "webhook:",
  routing: "routing:",
  security: "webhook:",
  trade: "trade:",
  agent: "agent:",
  bot: "bot:",
  email: "email:",
  database: "database:",
  retention: "retention:",
  cron: "cron:",
  behavior: "behavior:",
  exchanges: "trade:",
  fees: "trade:",
  ai: "ai:",
  report: "report:",
};

/**
 * Build CONFIG_KV key from worker + composite field key (`section:field`).
 * Mirrors workers/dashboard/src/lib/settings/prefixes.ts buildKVKey.
 */
export function buildDashboardKvKey(worker: string, fieldKey: string): string {
  if (fieldKey.includes(":")) {
    const [section, ...rest] = fieldKey.split(":");
    const sectionPrefix = DASHBOARD_SECTION_PREFIX[section ?? ""] ?? "";
    return `${sectionPrefix}${rest.join(":")}`;
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
 */
export function parseDashboardManifest(
  content: string,
  workerName: string
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
  } catch {
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
