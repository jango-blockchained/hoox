import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { DashboardEnv } from "@/lib/env";
import { z } from "zod";
import {
  AGENT_CONFIG_KV_KEY,
  applyAgentConfigFieldUpdates,
  expandAgentConfigToFieldMap,
  isAgentConfigEmbeddedField,
  parseAgentConfigJson,
  serializeAgentConfigForKv,
} from "@jango-blockchained/hoox-shared";
import {
  buildKVKey,
  isFlatKvSectionKey,
  stripWorkerPrefix,
  workerForKVKey,
  READ_PREFIXES,
  PREFIX_TO_WORKER,
} from "@/lib/settings/prefixes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AllSettings = Record<
  string,
  Record<string, string | number | boolean | undefined>
>;

// ── Zod schemas ────────────────────────────────────────────────────────

// A single setting value: string, number, or boolean (matches the
// SettingField.default type in lib/settings/types.ts). Nested objects
// and arrays are NOT supported at this boundary — the JSON string fields
// (e.g. agent-worker "config") carry those as serialized strings.
const SettingValueSchema = z.union([z.string(), z.number(), z.boolean()]);

// Single-field POST: { worker, key, value }
const SingleUpdateSchema = z.object({
  worker: z.string().min(1),
  key: z.string().min(1),
  value: SettingValueSchema,
});

// Batched POST: { settings: { [worker]: { [key]: value } } }
const BatchedUpdateSchema = z.object({
  settings: z.record(
    z.string().min(1),
    z.record(z.string().min(1), SettingValueSchema)
  ),
});

// ── Shared helpers (use the prefixes module — no inline maps here) ─────

async function listSettingsFromKV(env: DashboardEnv): Promise<AllSettings> {
  const settings: Record<string, unknown> = {};
  for (const prefix of READ_PREFIXES) {
    const list = await env.CONFIG_KV.list({ prefix });
    for (const kv of list.keys) {
      const value = await env.CONFIG_KV.get(kv.name);
      if (value === null) continue;
      try {
        settings[kv.name] = JSON.parse(value);
      } catch {
        // Store the raw string if not valid JSON (legacy values)
        settings[kv.name] = value;
      }
    }
  }

  const normalized: AllSettings = {};
  for (const [key, value] of Object.entries(settings)) {
    const worker = workerForKVKey(key);
    if (!worker) continue;
    const cleanKey = stripWorkerPrefix(key, worker);

    // Expand agent:config JSON into providers:*/models:*/risk:* field keys
    if (key === AGENT_CONFIG_KV_KEY || cleanKey === "config") {
      const raw =
        typeof value === "string"
          ? value
          : value && typeof value === "object"
            ? JSON.stringify(value)
            : null;
      const cfg =
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : parseAgentConfigJson(raw);
      const expanded = expandAgentConfigToFieldMap(cfg);
      const bucket = (normalized["agent-worker"] ??= {});
      for (const fk of Object.keys(expanded)) {
        const fv = expanded[fk];
        if (
          typeof fv === "string" ||
          typeof fv === "number" ||
          typeof fv === "boolean"
        ) {
          bucket[fk] = fv;
        }
      }
      // Also keep raw config string for the agent:config field itself
      if (typeof value === "string") {
        bucket["config"] = value;
      } else if (value && typeof value === "object") {
        bucket["config"] = JSON.stringify(value);
      }
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      (normalized[worker] ??= {})[cleanKey] = value;
    }
  }
  return normalized;
}

async function listSettingsFromD1Service(
  env: DashboardEnv
): Promise<AllSettings> {
  if (!env.D1_SERVICE) {
    throw new Error("D1 service binding not available");
  }
  const res = await env.D1_SERVICE.fetch(
    new Request("http://d1-worker.internal/api/settings", { method: "GET" })
  );
  if (!res.ok) {
    throw new Error(`D1 settings endpoint returned ${res.status}`);
  }
  const data = (await res.json()) as { settings?: AllSettings };
  return data.settings ?? {};
}

async function putToKV(
  env: DashboardEnv,
  kvKey: string,
  value: unknown
): Promise<void> {
  await env.CONFIG_KV.put(kvKey, JSON.stringify(value));
}

async function postToD1Service(
  env: DashboardEnv,
  worker: string,
  kvKey: string,
  value: unknown
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!env.D1_SERVICE) {
    return {
      ok: false,
      status: 500,
      error: "D1 service binding not available",
    };
  }
  const res = await env.D1_SERVICE.fetch(
    new Request("http://d1-worker.internal/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker, key: kvKey, value }),
    })
  );
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, status: res.status, error: error.error };
  }
  return { ok: true, status: 200 };
}

// ── Route handlers ─────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  _context: { params: Promise<Record<string, unknown>> }
) {
  try {
    const env = getCloudflareContext().env as DashboardEnv;
    if (env.CONFIG_KV) {
      const settings = await listSettingsFromKV(env);
      return NextResponse.json({ settings });
    }
    const settings = await listSettingsFromD1Service(env);
    return NextResponse.json({ settings });
  } catch (e) {
    console.error("Failed to fetch settings:", e);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings — accepts two shapes:
 *
 *   1. Single update (backward-compat):
 *      { worker: "hoox", key: "kill_switch", value: true }
 *
 *   2. Batched update (preferred):
 *      { settings: { "hoox": { "kill_switch": true, ... }, "trade-worker": { ... } } }
 *
 * The batched form lets the form send all field changes in a single round-trip
 * (30+ fields × N workers = much faster + simpler error handling).
 *
 * Worker name in the batched shape is the canonical worker name (e.g. "hoox"),
 * NOT the URL-safe variant.
 */
export async function POST(
  request: NextRequest,
  _context: { params: Promise<Record<string, unknown>> }
) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Try batched shape first (preferred)
  const batched = BatchedUpdateSchema.safeParse(raw);
  if (batched.success) {
    return handleBatchedUpdate(batched.data.settings);
  }

  // Fall back to single-field shape (backward compat)
  const single = SingleUpdateSchema.safeParse(raw);
  if (single.success) {
    return handleSingleUpdate(single.data);
  }

  return NextResponse.json(
    {
      error: "Invalid request body",
      singleErrors: single.error.issues,
      batchedErrors: batched.error.issues,
    },
    { status: 400 }
  );
}

async function readAgentConfigRaw(env: DashboardEnv): Promise<string | null> {
  if (env.CONFIG_KV) {
    return env.CONFIG_KV.get(AGENT_CONFIG_KV_KEY);
  }
  return null;
}

async function writeAgentConfigEmbedded(
  env: DashboardEnv,
  updates: Record<string, string | number | boolean>
): Promise<{ kvKey: string }> {
  const raw = await readAgentConfigRaw(env);
  const current = parseAgentConfigJson(raw);
  const next = applyAgentConfigFieldUpdates(current, updates);
  const payload = serializeAgentConfigForKv(next);
  if (env.CONFIG_KV) {
    // Store as raw JSON string (agent-worker JSON.parse's the value)
    await env.CONFIG_KV.put(AGENT_CONFIG_KV_KEY, payload);
  } else {
    await postToD1Service(env, "agent-worker", AGENT_CONFIG_KV_KEY, payload);
  }
  return { kvKey: AGENT_CONFIG_KV_KEY };
}

async function handleSingleUpdate(input: z.infer<typeof SingleUpdateSchema>) {
  const env = getCloudflareContext().env as DashboardEnv;

  // providers/models/risk numerics → merge into agent:config
  if (isAgentConfigEmbeddedField(input.key)) {
    try {
      const { kvKey } = await writeAgentConfigEmbedded(env, {
        [input.key]: input.value,
      });
      // Dual-write trade:* for risk fields the trade path may also read
      if (
        input.key === "risk:max_daily_drawdown_percent" ||
        input.key === "risk:trailing_stop_percent"
      ) {
        const flatKey = buildKVKey(input.worker, input.key);
        if (env.CONFIG_KV) {
          await putToKV(env, flatKey, input.value);
        }
      }
      return NextResponse.json({
        success: true,
        worker: input.worker,
        key: input.key,
        value: input.value,
        kvKey,
      });
    } catch (err) {
      console.error("settings POST agent:config error:", err);
      return NextResponse.json(
        { error: "Failed to save agent:config field" },
        { status: 500 }
      );
    }
  }

  if (!isFlatKvSectionKey(input.key)) {
    return NextResponse.json(
      {
        error:
          "This setting is not a flat CONFIG_KV key (cron/behavior are not wired).",
        key: input.key,
      },
      { status: 400 }
    );
  }
  const kvKey = buildKVKey(input.worker, input.key);

  try {
    if (env.CONFIG_KV) {
      await putToKV(env, kvKey, input.value);
      return NextResponse.json({
        success: true,
        worker: input.worker,
        key: input.key,
        value: input.value,
        kvKey,
      });
    }
    const result = await postToD1Service(env, input.worker, kvKey, input.value);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "D1 service error" },
        { status: result.status }
      );
    }
    return NextResponse.json({
      success: true,
      worker: input.worker,
      key: input.key,
      value: input.value,
      kvKey,
    });
  } catch (err) {
    console.error("settings POST error:", err);
    return NextResponse.json(
      { error: "Failed to save setting" },
      { status: 500 }
    );
  }
}

async function handleBatchedUpdate(
  settings: Record<string, Record<string, string | number | boolean>>
) {
  const env = getCloudflareContext().env as DashboardEnv;
  const writes: Array<{
    worker: string;
    key: string;
    kvKey: string;
    value: unknown;
  }> = [];

  const skipped: string[] = [];
  const agentConfigUpdates: Record<string, string | number | boolean> = {};

  for (const [worker, fields] of Object.entries(settings)) {
    for (const [key, value] of Object.entries(fields)) {
      if (isAgentConfigEmbeddedField(key)) {
        agentConfigUpdates[key] = value;
        // Dual-write risk trade:* keys alongside agent:config
        if (
          key === "risk:max_daily_drawdown_percent" ||
          key === "risk:trailing_stop_percent"
        ) {
          writes.push({
            worker,
            key,
            kvKey: buildKVKey(worker, key),
            value,
          });
        }
        continue;
      }
      if (!isFlatKvSectionKey(key)) {
        skipped.push(`${worker}.${key}`);
        continue;
      }
      writes.push({ worker, key, kvKey: buildKVKey(worker, key), value });
    }
  }

  try {
    let agentWritten = 0;
    if (Object.keys(agentConfigUpdates).length > 0) {
      await writeAgentConfigEmbedded(env, agentConfigUpdates);
      agentWritten = 1;
    }

    if (writes.length === 0 && agentWritten === 0) {
      return NextResponse.json({
        success: true,
        written: 0,
        skipped,
        note:
          skipped.length > 0
            ? "Skipped unwired sections (cron/behavior)"
            : undefined,
      });
    }

    if (env.CONFIG_KV) {
      // Parallel writes — KV is consistent and supports concurrent puts
      await Promise.all(writes.map((w) => putToKV(env, w.kvKey, w.value)));
    } else {
      // D1 fallback is sequential because the d1-worker API takes one key at a time
      for (const w of writes) {
        const result = await postToD1Service(env, w.worker, w.kvKey, w.value);
        if (!result.ok) {
          return NextResponse.json(
            {
              error: `Failed to save ${w.worker}.${w.key}: ${result.error ?? "unknown"}`,
              written: writes.indexOf(w),
            },
            { status: result.status }
          );
        }
      }
    }
    return NextResponse.json({
      success: true,
      written: writes.length + agentWritten,
      skipped: skipped.length > 0 ? skipped : undefined,
    });
  } catch (err) {
    console.error("settings batched POST error:", err);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

// Re-export the prefix map so existing tests that imported it from this
// module continue to work. (Removed in a follow-up if all callers migrate.)
export { PREFIX_TO_WORKER as PREFIX_TO_WORKER_LEGACY };
