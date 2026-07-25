import { z } from "zod";
import type { DashboardSection, MergedSettings, SettingField } from "./types";

export interface WorkerConfigManifest {
  worker: string;
  displayName: string;
  description?: string;
  sections: DashboardSection[];
}

/**
 * Zod schema for the on-disk dashboard.jsonc shape.
 * Permissive on optional fields; strict on types so a typo in the JSONC
 * doesn't silently produce a malformed manifest.
 *
 * NOTE: Also exported so `scripts/sync-dashboard-configs.ts` can reuse the
 * schema. Keep the export in sync between both files.
 */
export const ParsedSectionSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    priority: z.number().int().nonnegative().optional(),
    fields: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    options: z
      .record(z.string(), z.array(z.union([z.string(), z.number()])))
      .optional(),
    descriptions: z.record(z.string(), z.string()).optional(),
    // Per-field metadata for the UI. "secrets" marks secret fields
    // (read-only in the form, set via CLI). "secret_commands" maps each
    // secret field to the exact CLI command.
    secrets: z.record(z.string(), z.boolean()).optional(),
    secret_commands: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const DashboardManifestFileSchema = z
  .object({
    display_name: z.string().optional(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    sections: z.record(z.string(), ParsedSectionSchema).optional(),
  })
  .strict();

function parseFieldValue(
  value: string | number | boolean
): SettingField["type"] {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value === "true" || value === "false") return "boolean";
  if (!isNaN(Number(value))) return "number";
  return "text";
}

function createField(
  sectionId: string,
  key: string,
  value: string | number | boolean
): SettingField {
  const field: SettingField = {
    key: `${sectionId}:${key}`,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type: parseFieldValue(value) as SettingField["type"],
    default: value,
    placeholder: String(value),
  };

  return field;
}

export function parseDashboardJSONC(
  content: string,
  workerName: string
): WorkerConfigManifest {
  try {
    // Strip comments to safely parse JSONC
    const cleanContent = content.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
    const result = DashboardManifestFileSchema.safeParse(
      JSON.parse(cleanContent)
    );
    if (!result.success) {
      console.error(
        `Failed to parse dashboard.jsonc for ${workerName}:`,
        result.error.issues
      );
      return {
        worker: workerName,
        displayName: workerName,
        description: "Failed to load configuration",
        sections: [],
      };
    }
    const parsed = result.data;

    const displayName = parsed.display_name || parsed.displayName || workerName;
    const description = parsed.description || "";
    const sections: DashboardSection[] = [];

    if (parsed.sections) {
      for (const [sectionId, sectionData] of Object.entries(parsed.sections)) {
        const fields: SettingField[] = [];
        const sectionFields = sectionData.fields || {};
        const sectionOptions = sectionData.options || {};
        const sectionDescriptions = sectionData.descriptions || {};
        const sectionSecrets = sectionData.secrets || {};
        const sectionSecretCommands = sectionData.secret_commands || {};

        for (const [key, value] of Object.entries(sectionFields)) {
          const field = createField(
            sectionId,
            key,
            value as string | number | boolean
          );

          if (sectionOptions[key]) {
            field.type = "select";
            field.options = sectionOptions[key].map((opt: string | number) => ({
              value: String(opt),
              label: String(opt),
            }));
          }

          if (sectionDescriptions[key]) {
            field.description = String(sectionDescriptions[key]);
          }

          // S-3: secret fields are read-only in the form. The default value
          // ("Requires CLI Setup" etc.) is shown as placeholder, not editable.
          if (sectionSecrets[key]) {
            field.kind = "secret";
            field.cliCommand = sectionSecretCommands[key];
            field.default = value; // keep for display
          }

          fields.push(field);
        }

        sections.push({
          id: sectionId,
          title:
            sectionData.title ||
            sectionId
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
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
  } catch (error) {
    console.error(`Failed to parse dashboard.jsonc for ${workerName}:`, error);
    return {
      worker: workerName,
      displayName: workerName,
      description: "Failed to load configuration",
      sections: [],
    };
  }
}

const BUILTIN_CONFIGS: Record<string, () => Promise<WorkerConfigManifest>> = {
  async hoox() {
    const res = await fetch("/workers/hoox-worker.jsonc");
    if (!res.ok)
      return { worker: "hoox", displayName: "Gateway", sections: [] };
    return parseDashboardJSONC(await res.text(), "hoox");
  },
  async "trade-worker"() {
    const res = await fetch("/workers/trade-worker.jsonc");
    if (!res.ok)
      return {
        worker: "trade-worker",
        displayName: "Trade Worker",
        sections: [],
      };
    return parseDashboardJSONC(await res.text(), "trade-worker");
  },
  async "agent-worker"() {
    const res = await fetch("/workers/agent-worker.jsonc");
    if (!res.ok)
      return {
        worker: "agent-worker",
        displayName: "Agent Worker",
        sections: [],
      };
    return parseDashboardJSONC(await res.text(), "agent-worker");
  },
  async "telegram-worker"() {
    const res = await fetch("/workers/telegram-worker.jsonc");
    if (!res.ok)
      return {
        worker: "telegram-worker",
        displayName: "Telegram Worker",
        sections: [],
      };
    return parseDashboardJSONC(await res.text(), "telegram-worker");
  },
  async "d1-worker"() {
    const res = await fetch("/workers/d1-worker.jsonc");
    if (!res.ok)
      return { worker: "d1-worker", displayName: "D1 Worker", sections: [] };
    return parseDashboardJSONC(await res.text(), "d1-worker");
  },
  async "email-worker"() {
    const res = await fetch("/workers/email-worker.jsonc");
    if (!res.ok)
      return {
        worker: "email-worker",
        displayName: "Email Worker",
        sections: [],
      };
    return parseDashboardJSONC(await res.text(), "email-worker");
  },
  async "web3-wallet-worker"() {
    const res = await fetch("/workers/web3-wallet-worker.jsonc");
    if (!res.ok)
      return {
        worker: "web3-wallet-worker",
        displayName: "Web3 Wallet",
        sections: [],
      };
    return parseDashboardJSONC(await res.text(), "web3-wallet-worker");
  },
  // analytics-worker and report-worker had no CONFIG_KV binding until
  // the audit remediation. Their jsonc configs are served from public/workers/
  // so the form can still display them. Their health dot will be red
  // until the submodule PRs deploy.
  async "analytics-worker"() {
    const res = await fetch("/workers/analytics-worker.jsonc");
    if (!res.ok)
      return {
        worker: "analytics-worker",
        displayName: "Analytics Worker",
        sections: [],
      };
    return parseDashboardJSONC(await res.text(), "analytics-worker");
  },
  async "report-worker"() {
    const res = await fetch("/workers/report-worker.jsonc");
    if (!res.ok)
      return {
        worker: "report-worker",
        displayName: "Report Worker",
        sections: [],
      };
    return parseDashboardJSONC(await res.text(), "report-worker");
  },
};

export async function loadWorkerConfig(
  workerName: string
): Promise<WorkerConfigManifest | null> {
  const loader = BUILTIN_CONFIGS[workerName];
  if (!loader) {
    console.warn(`No config loader found for worker: ${workerName}`);
    return null;
  }

  try {
    return await loader();
  } catch (error) {
    console.error(`Failed to load config for worker ${workerName}:`, error);
    return {
      worker: workerName,
      displayName: workerName,
      description: "Configuration unavailable",
      sections: [],
    };
  }
}

export async function loadAllConfigs(
  workerNames: string[]
): Promise<WorkerConfigManifest[]> {
  const configs = await Promise.all(
    workerNames.map((name) => loadWorkerConfig(name))
  );

  return configs.filter(
    (c): c is WorkerConfigManifest => c !== null && c.sections.length > 0
  );
}

export function flattenSettings(
  configs: WorkerConfigManifest[]
): MergedSettings {
  const merged: MergedSettings = {};

  for (const config of configs) {
    merged[config.worker] = {};

    for (const section of config.sections) {
      for (const field of section.fields) {
        merged[config.worker][field.key] = field.default;
      }
    }
  }

  return merged;
}

/**
 * Fetch all runtime setting overrides from /api/settings.
 *
 * Returns the nested shape: { [worker]: { [key]: value } }.
 * The shape matches the `MergedSettings` type but is loosely typed at
 * the field-value layer (any string|number|boolean) so the merge logic
 * in loadMergedSettings can compare values without per-field casts.
 *
 * The `workerNames` argument is accepted for future per-worker filtering
 * (e.g. when workers don't share a CONFIG_KV namespace) but currently the
 * server returns all workers' settings in one call. Underscore-prefixed
 * to acknowledge the unused-warning without committing to remove it.
 */
export async function getRuntimeOverrides(
  _workerNames: string[]
): Promise<Record<string, Record<string, string | number | boolean>>> {
  try {
    const res = await fetch(`/api/settings`);
    if (res.ok) {
      const data = (await res.json()) as {
        settings?: Record<string, Record<string, string | number | boolean>>;
      };
      return data.settings ?? {};
    }
  } catch {
    // API unavailable (network, CORS, 5xx) — return empty so the form
    // still renders with default values from dashboard.jsonc.
  }
  return {};
}

export async function loadMergedSettings(
  workerNames: string[]
): Promise<MergedSettings> {
  const configs = await loadAllConfigs(workerNames);
  const defaults = flattenSettings(configs);
  const overrides = await getRuntimeOverrides(workerNames);

  const merged: MergedSettings = {};

  for (const [worker, fields] of Object.entries(defaults)) {
    merged[worker] = { ...fields };
    const workerOverrides = overrides[worker];
    if (!workerOverrides) continue;

    for (const key of Object.keys(fields)) {
      // L-7: key form is "section:field". The override map can use either
      // the prefixed form ("section:field") or the raw form ("field"),
      // depending on how the server stored it. Check both.
      const rawKey = key.split(":")[1] ?? key;
      const candidate =
        workerOverrides[rawKey] !== undefined
          ? workerOverrides[rawKey]
          : workerOverrides[key];
      if (candidate !== undefined) {
        merged[worker][key] = candidate;
      }
    }
  }

  return merged;
}
