/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Map dashboard.jsonc provider/model (and optional risk) fields onto the
 * `agent:config` JSON blob that the agent-worker actually reads.
 *
 * Flat keys like `agent:default_provider` are dead; these helpers keep the
 * UI field shape while reading/writing the single CONFIG_KV key.
 */
import { KV_AGENT_CONFIG } from "./kvKeys";

/** CONFIG_KV key for the agent JSON config document. */
export const AGENT_CONFIG_KV_KEY = KV_AGENT_CONFIG;

export type AgentConfigFieldSpec =
  | {
      kind: "top";
      key:
        | "defaultProvider"
        | "fallbackChain"
        | "timeoutMs"
        | "retryCount"
        | "maxDailyDrawdownPercent"
        | "trailingStopPercent"
        | "takeProfitPercent";
    }
  | { kind: "model"; provider: string };

/**
 * Composite field keys (`section:field` from dashboard.jsonc) that embed
 * into agent:config rather than flat CONFIG_KV keys.
 */
export const AGENT_CONFIG_EMBEDDED_FIELDS: Readonly<
  Record<string, AgentConfigFieldSpec>
> = {
  "providers:default_provider": { kind: "top", key: "defaultProvider" },
  "providers:fallback_chain": { kind: "top", key: "fallbackChain" },
  "providers:timeout_ms": { kind: "top", key: "timeoutMs" },
  "providers:retry_count": { kind: "top", key: "retryCount" },
  "models:workers_ai_model": { kind: "model", provider: "workers-ai" },
  "models:openai_model": { kind: "model", provider: "openai" },
  "models:anthropic_model": { kind: "model", provider: "anthropic" },
  "models:google_model": { kind: "model", provider: "google" },
  // Risk numerics the agent reads from agent:config (not trade:* KV alone)
  "risk:max_daily_drawdown_percent": {
    kind: "top",
    key: "maxDailyDrawdownPercent",
  },
  "risk:trailing_stop_percent": { kind: "top", key: "trailingStopPercent" },
  "risk:take_profit_percent": { kind: "top", key: "takeProfitPercent" },
};

/** Sections whose fields are edited via agent:config (not flat KV). */
export const DASHBOARD_SECTIONS_AGENT_CONFIG: ReadonlySet<string> = new Set([
  "providers",
  "models",
]);

export function isAgentConfigEmbeddedField(fieldKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    AGENT_CONFIG_EMBEDDED_FIELDS,
    fieldKey
  );
}

export function isAgentConfigSection(sectionId: string): boolean {
  return DASHBOARD_SECTIONS_AGENT_CONFIG.has(sectionId);
}

/** Parse agent:config KV payload (handles double-encoded JSON strings). */
export function parseAgentConfigJson(
  raw: string | null | undefined
): Record<string, unknown> {
  if (raw === null || raw === undefined || raw === "") return {};
  try {
    let v: unknown = JSON.parse(raw);
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        return {};
      }
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return { ...(v as Record<string, unknown>) };
    }
  } catch {
    /* invalid */
  }
  return {};
}

export function serializeAgentConfigForKv(
  config: Record<string, unknown>
): string {
  return JSON.stringify(config);
}

const NUMBER_TOP_KEYS = new Set([
  "timeoutMs",
  "retryCount",
  "maxDailyDrawdownPercent",
  "trailingStopPercent",
  "takeProfitPercent",
]);

export function getAgentConfigEmbeddedValue(
  config: Record<string, unknown>,
  fieldKey: string
): string | number | boolean | undefined {
  const spec = AGENT_CONFIG_EMBEDDED_FIELDS[fieldKey];
  if (!spec) return undefined;

  if (spec.kind === "model") {
    const map = config.modelMap;
    if (!map || typeof map !== "object" || Array.isArray(map)) return undefined;
    const v = (map as Record<string, unknown>)[spec.provider];
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    )
      return v;
    return undefined;
  }

  const v = config[spec.key];
  if (spec.key === "fallbackChain") {
    if (Array.isArray(v)) return JSON.stringify(v);
    if (typeof v === "string") return v;
    return undefined;
  }
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return v;
  }
  return undefined;
}

export function setAgentConfigEmbeddedValue(
  config: Record<string, unknown>,
  fieldKey: string,
  value: string | number | boolean
): Record<string, unknown> {
  const spec = AGENT_CONFIG_EMBEDDED_FIELDS[fieldKey];
  if (!spec) return { ...config };

  const next: Record<string, unknown> = { ...config };

  if (spec.kind === "model") {
    const prev =
      next.modelMap &&
      typeof next.modelMap === "object" &&
      !Array.isArray(next.modelMap)
        ? (next.modelMap as Record<string, unknown>)
        : {};
    next.modelMap = { ...prev, [spec.provider]: String(value) };
    return next;
  }

  if (spec.key === "fallbackChain") {
    if (typeof value === "string") {
      try {
        next.fallbackChain = JSON.parse(value);
      } catch {
        next.fallbackChain = value;
      }
    } else {
      next.fallbackChain = value;
    }
    return next;
  }

  if (NUMBER_TOP_KEYS.has(spec.key)) {
    const n = typeof value === "number" ? value : Number(value);
    next[spec.key] = Number.isFinite(n) ? n : value;
    return next;
  }

  next[spec.key] = value;
  return next;
}

/** Expand agent:config into dashboard composite field keys for UI forms. */
export function expandAgentConfigToFieldMap(
  config: Record<string, unknown>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const fieldKey of Object.keys(AGENT_CONFIG_EMBEDDED_FIELDS)) {
    const v = getAgentConfigEmbeddedValue(config, fieldKey);
    if (v !== undefined) out[fieldKey] = v;
  }
  return out;
}

/** Apply multiple embedded field updates onto an agent:config object. */
export function applyAgentConfigFieldUpdates(
  config: Record<string, unknown>,
  updates: Record<string, string | number | boolean>
): Record<string, unknown> {
  let next = { ...config };
  for (const [fieldKey, value] of Object.entries(updates)) {
    if (isAgentConfigEmbeddedField(fieldKey)) {
      next = setAgentConfigEmbeddedValue(next, fieldKey, value);
    }
  }
  return next;
}
