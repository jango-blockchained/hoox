/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * Worker Settings View — same options as the web dashboard Settings form,
 * driven by workers/<name>/dashboard.jsonc manifests.
 *
 * Layout:
 *   Header
 *   [ Workers list ]  [ Sections + fields for selected worker ]
 *
 * Values load from CONFIG_KV via `hoox config kv get`; saves use
 * `hoox config kv set`. Secret fields are read-only (CLI command shown).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import {
  Colors,
  AGENT_CONFIG_KV_KEY,
  applyAgentConfigFieldUpdates,
  buildDashboardKvKey,
  getAgentConfigEmbeddedValue,
  isAgentConfigEmbeddedField,
  isDashboardSectionEditable,
  parseAgentConfigJson,
  serializeAgentConfigForKv,
  useUIStore,
  type DashboardSettingField,
  type WorkerDashboardManifest,
} from "@hoox-sh/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { ViewHeader } from "../shared/view-header";
import { Panel } from "../shared/panel";
import { Spinner, EmptyState } from "../shared/spinner";
import { cliBridge } from "../../services/cli-bridge";
import { loadDashboardSettingsManifests } from "../../services/dashboard-settings-loader";

function parseKvValue(
  raw: string | null,
  field: DashboardSettingField
): string | number | boolean {
  if (raw === null || raw === "") return field.default;
  let v: unknown = raw;
  try {
    v = JSON.parse(raw);
  } catch {
    // keep raw string
  }
  if (field.type === "boolean") {
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return Boolean(field.default);
  }
  if (field.type === "number") {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : (field.default as number);
  }
  return typeof v === "string" ? v : String(v);
}

/**
 * Wire format for CONFIG_KV — match CLI apply-manifest / worker readers:
 * plain strings stored raw; booleans/numbers as JSON literals.
 */
function formatForKv(value: string | number | boolean): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function displayValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function WorkerSettingsView() {
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "worker-settings";

  const [manifests, setManifests] = useState<WorkerDashboardManifest[]>([]);
  const [workerIndex, setWorkerIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [values, setValues] = useState<
    Record<string, string | number | boolean>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Monotonic generation so out-of-order loadValues results are ignored. */
  const loadGeneration = useRef(0);

  const selected = manifests[workerIndex] ?? null;

  const flatFields = useMemo(() => {
    if (!selected)
      return [] as Array<{
        sectionTitle: string;
        field: DashboardSettingField;
        kvKey: string;
      }>;
    const out: Array<{
      sectionTitle: string;
      field: DashboardSettingField;
      kvKey: string;
    }> = [];
    for (const section of selected.sections) {
      if (!isDashboardSectionEditable(section.id)) continue;
      for (const field of section.fields) {
        const embedded = isAgentConfigEmbeddedField(field.key);
        out.push({
          sectionTitle: section.title,
          field,
          kvKey: embedded
            ? `${AGENT_CONFIG_KV_KEY} · ${field.key}`
            : buildDashboardKvKey(selected.worker, field.key),
        });
      }
    }
    return out;
  }, [selected]);

  const loadValues = useCallback(async (manifest: WorkerDashboardManifest) => {
    const gen = ++loadGeneration.current;
    const fields: DashboardSettingField[] = [];
    for (const section of manifest.sections) {
      if (!isDashboardSectionEditable(section.id)) continue;
      for (const field of section.fields) fields.push(field);
    }

    const needsAgentConfig = fields.some((f) =>
      isAgentConfigEmbeddedField(f.key)
    );
    let agentConfig: Record<string, unknown> = {};
    if (needsAgentConfig) {
      const cfgResult = await cliBridge.configKvGet(AGENT_CONFIG_KV_KEY);
      agentConfig = parseAgentConfigJson(
        cfgResult.success ? cfgResult.data : null
      );
    }

    // Parallel gets for flat keys; agent:config fields read from one blob.
    const entries = await Promise.all(
      fields.map(async (field) => {
        if (field.kind === "secret") {
          return [field.key, field.default] as const;
        }
        if (isAgentConfigEmbeddedField(field.key)) {
          const v = getAgentConfigEmbeddedValue(agentConfig, field.key);
          return [field.key, v ?? field.default] as const;
        }
        const kvKey = buildDashboardKvKey(manifest.worker, field.key);
        const result = await cliBridge.configKvGet(kvKey);
        return [
          field.key,
          parseKvValue(result.success ? result.data : null, field),
        ] as const;
      })
    );

    if (gen !== loadGeneration.current) return;
    const next: Record<string, string | number | boolean> = {};
    for (const [k, v] of entries) next[k] = v;
    setValues(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = loadDashboardSettingsManifests();
      setManifests(list);
      if (list.length === 0) {
        setError(
          "No dashboard.jsonc manifests found. Set HOOX_REPO or run from the monorepo."
        );
        setLoading(false);
        return;
      }
      const idx = Math.min(workerIndex, list.length - 1);
      setWorkerIndex(idx);
      await loadValues(list[idx]!);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadValues, workerIndex]);

  useEffect(() => {
    if (!isActive) return;
    void refresh();
  }, [isActive]); // refresh intentionally omitted — reload only on view enter

  const selectWorker = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= manifests.length) return;
      setWorkerIndex(idx);
      setFieldIndex(0);
      setLoading(true);
      try {
        await loadValues(manifests[idx]!);
      } finally {
        // Only clear loading if this is still the latest load
        if (loadGeneration.current > 0) setLoading(false);
      }
    },
    [manifests, loadValues]
  );

  const cycleFieldValue = useCallback(
    (delta: number) => {
      const row = flatFields[fieldIndex];
      if (!row || row.field.kind === "secret") return;
      const { field } = row;
      const current = values[field.key] ?? field.default;

      if (field.type === "boolean") {
        setValues((v) => ({ ...v, [field.key]: !current }));
        return;
      }
      if (
        field.type === "select" &&
        field.options &&
        field.options.length > 0
      ) {
        const opts = field.options.map((o) => o.value);
        const cur = String(current);
        let i = opts.indexOf(cur);
        if (i < 0) i = 0;
        const next = opts[(i + delta + opts.length) % opts.length]!;
        // preserve number type when options are numeric defaults
        const asNum = Number(next);
        setValues((v) => ({
          ...v,
          [field.key]:
            field.default !== undefined && typeof field.default === "number"
              ? asNum
              : next,
        }));
        return;
      }
      if (field.type === "number") {
        const n = typeof current === "number" ? current : Number(current);
        const step = delta > 0 ? 1 : -1;
        setValues((v) => ({
          ...v,
          [field.key]: (Number.isFinite(n) ? n : 0) + step,
        }));
      }
    },
    [flatFields, fieldIndex, values]
  );

  const saveCurrent = useCallback(async () => {
    const row = flatFields[fieldIndex];
    if (!row || !selected) return;
    if (row.field.kind === "secret") {
      setStatus(
        row.field.cliCommand
          ? `Secret — run: ${row.field.cliCommand}`
          : "Secret — set via CLI (hoox secrets …)"
      );
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const value = values[row.field.key] ?? row.field.default;

      if (isAgentConfigEmbeddedField(row.field.key)) {
        const cfgResult = await cliBridge.configKvGet(AGENT_CONFIG_KV_KEY);
        const current = parseAgentConfigJson(
          cfgResult.success ? cfgResult.data : null
        );
        const next = applyAgentConfigFieldUpdates(current, {
          [row.field.key]: value,
        });
        const result = await cliBridge.configKvSet(
          AGENT_CONFIG_KV_KEY,
          serializeAgentConfigForKv(next)
        );
        if (!result.success) {
          setStatus(
            `Save failed: ${result.stderr || result.stdout || "unknown error"}`
          );
        } else {
          setStatus(
            `Saved ${AGENT_CONFIG_KV_KEY} (${row.field.key}) = ${displayValue(value)}`
          );
        }
        // risk:* also dual-write trade:* flat keys when they map (except embedded-only take_profit)
        if (
          row.field.key === "risk:max_daily_drawdown_percent" ||
          row.field.key === "risk:trailing_stop_percent"
        ) {
          const flatKey = buildDashboardKvKey(selected.worker, row.field.key);
          await cliBridge.configKvSet(flatKey, formatForKv(value));
        }
      } else {
        const flatKey = buildDashboardKvKey(selected.worker, row.field.key);
        const result = await cliBridge.configKvSet(flatKey, formatForKv(value));
        if (!result.success) {
          setStatus(
            `Save failed: ${result.stderr || result.stdout || "unknown error"}`
          );
        } else {
          setStatus(`Saved ${flatKey} = ${displayValue(value)}`);
        }
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [flatFields, fieldIndex, selected, values]);

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "up") {
      setFieldIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.name === "down") {
      setFieldIndex((i) => Math.min(Math.max(0, flatFields.length - 1), i + 1));
      return;
    }
    if (key.name === "left" || key.name === "pageup") {
      void selectWorker(workerIndex - 1);
      return;
    }
    if (key.name === "right" || key.name === "pagedown") {
      void selectWorker(workerIndex + 1);
      return;
    }
    if (key.name === "space" || key.name === "return" || key.name === "enter") {
      if (key.name === "space") {
        cycleFieldValue(1);
      } else {
        void saveCurrent();
      }
      return;
    }
    if (key.name === "[" || key.raw === "[") {
      cycleFieldValue(-1);
      return;
    }
    if (key.name === "]" || key.raw === "]") {
      cycleFieldValue(1);
      return;
    }
    if (key.name === "r" && !key.ctrl && !key.meta) {
      void refresh();
    }
  });

  return (
    <ErrorBoundary viewName="Worker Settings">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        <ViewHeader
          title="WORKER SETTINGS"
          meta={
            <text fg={Colors.muted} dim>
              Same options as web dashboard · ←→ worker · ↑↓ field · Space edit
              · Enter save · R refresh
            </text>
          }
        />

        {error ? <text fg={Colors.error}>{error}</text> : null}
        {status ? (
          <text fg={Colors.info} dim>
            {status}
            {saving ? " …" : ""}
          </text>
        ) : null}

        {loading && manifests.length === 0 ? (
          <Spinner label="Loading dashboard.jsonc manifests…" />
        ) : manifests.length === 0 ? (
          <EmptyState
            message="No worker settings manifests"
            suggestion="Ensure workers/*/dashboard.jsonc exist under HOOX_REPO"
            icon="⚙"
          />
        ) : (
          <box flexDirection="row" flexGrow={1} gap={1}>
            <Panel title="WORKERS" width={28} elevated={false} compact focused>
              {manifests.map((m, i) => (
                <text
                  key={m.worker}
                  fg={i === workerIndex ? Colors.accent : Colors.muted}
                  bold={i === workerIndex}
                  onMouseUp={() => void selectWorker(i)}
                >
                  {i === workerIndex ? "▸ " : "  "}
                  {m.displayName}
                </text>
              ))}
            </Panel>

            <Panel
              title={selected?.displayName ?? "SETTINGS"}
              flexGrow={1}
              elevated={false}
              compact
            >
              {selected?.description ? (
                <text fg={Colors.dim} dim>
                  {selected.description}
                </text>
              ) : null}
              {selected?.worker === "agent-worker" ? (
                <text fg={Colors.muted} dim>
                  Providers/models/risk numerics write agent:config ·
                  cron/behavior not wired · secrets via CLI
                </text>
              ) : null}

              {loading ? (
                <Spinner label="Loading values from CONFIG_KV…" />
              ) : flatFields.length === 0 ? (
                <text fg={Colors.muted}>No fields in this manifest.</text>
              ) : (
                <scrollbox flexGrow={1} height={16}>
                  {flatFields.map((row, i) => {
                    const active = i === fieldIndex;
                    const val = values[row.field.key] ?? row.field.default;
                    const isSecret = row.field.kind === "secret";
                    const isDanger = row.field.kind === "dangerous";
                    return (
                      <box key={row.field.key} flexDirection="column" gap={0}>
                        {i === 0 ||
                        flatFields[i - 1]?.sectionTitle !== row.sectionTitle ? (
                          <text fg={Colors.accent} bold dim>
                            {row.sectionTitle}
                          </text>
                        ) : null}
                        <box
                          flexDirection="row"
                          gap={1}
                          backgroundColor={active ? Colors.card : undefined}
                        >
                          <text
                            fg={
                              isSecret
                                ? Colors.warning
                                : isDanger
                                  ? Colors.error
                                  : active
                                    ? Colors.accent
                                    : Colors.foreground
                            }
                            bold={active}
                          >
                            {row.field.label}
                          </text>
                          <text fg={Colors.dim} dim>
                            {row.kvKey}
                          </text>
                          <box flexGrow={1} />
                          <text
                            fg={
                              isSecret
                                ? Colors.muted
                                : typeof val === "boolean"
                                  ? val
                                    ? Colors.success
                                    : Colors.muted
                                  : Colors.highlight
                            }
                            bold={!isSecret}
                          >
                            {isSecret
                              ? "(secret — CLI)"
                              : formatFieldValue(row.field, val)}
                          </text>
                        </box>
                        {active && row.field.description ? (
                          <text fg={Colors.dim} dim>
                            {row.field.description}
                          </text>
                        ) : null}
                        {active && isSecret && row.field.cliCommand ? (
                          <text fg={Colors.warning} dim>
                            {row.field.cliCommand}
                          </text>
                        ) : null}
                      </box>
                    );
                  })}
                </scrollbox>
              )}
            </Panel>
          </box>
        )}
      </box>
    </ErrorBoundary>
  );
}

/** Format field value for the right column. */
function formatFieldValue(
  field: DashboardSettingField,
  val: string | number | boolean
): string {
  if (field.type === "boolean") {
    return val ? "[x] true" : "[ ] false";
  }
  if (field.type === "select") {
    return `◀ ${displayValue(val)} ▶`;
  }
  const s = displayValue(val);
  return s.length > 40 ? s.slice(0, 37) + "…" : s;
}
