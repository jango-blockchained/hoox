"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldError,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Zap,
  Shield,
  Brain,
  Bell,
  Save,
  Database,
  Mail,
  Layers,
  Clock,
  Activity,
  Search,
  Archive,
  Router,
  Send,
  Sparkles,
  Percent,
  Wallet,
  Server,
  Cpu,
  FileText,
  BarChart3,
  Globe,
  Key,
  RotateCcw,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import type { WorkerConfigManifest } from "@/lib/settings/loader";
import { loadAllConfigs, loadMergedSettings } from "@/lib/settings/loader";
import type { DashboardSection, SettingField } from "@/lib/settings/types";
import { DEFAULT_WORKER_LIST } from "@/lib/settings/workers";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  router: Router,
  zap: Zap,
  shield: Shield,
  brain: Brain,
  bell: Bell,
  database: Database,
  mail: Mail,
  layers: Layers,
  clock: Clock,
  activity: Activity,
  search: Search,
  archive: Archive,
  send: Send,
  sparkles: Sparkles,
  percent: Percent,
  // F-5: web3-wallet-worker.jsonc uses "wallet" — was missing from the map
  // so it fell back to Zap. Now correctly renders the Wallet icon.
  wallet: Wallet,
  // Newly added for analytics-worker / report-worker / agent-worker
  // sub-sections that were previously hidden because the parent jsonc
  // was drifted.
  server: Server,
  cpu: Cpu,
  "file-text": FileText,
  "bar-chart": BarChart3,
  globe: Globe,
  key: Key,
};

interface WorkerHealth {
  kvReachable: boolean;
  lastChecked: number;
  error?: string;
}

type WorkerHealthMap = Record<string, WorkerHealth>;

type SettingsMap = Record<string, Record<string, string | number | boolean>>;

function cloneSettings(src: SettingsMap): SettingsMap {
  const out: SettingsMap = {};
  for (const [worker, fields] of Object.entries(src)) {
    out[worker] = { ...fields };
  }
  return out;
}

function settingsEqual(a: SettingsMap, b: SettingsMap): boolean {
  const aWorkers = Object.keys(a);
  const bWorkers = Object.keys(b);
  if (aWorkers.length !== bWorkers.length) return false;
  for (const worker of aWorkers) {
    const af = a[worker] ?? {};
    const bf = b[worker] ?? {};
    const keys = new Set([...Object.keys(af), ...Object.keys(bf)]);
    for (const key of keys) {
      if (af[key] !== bf[key]) return false;
    }
  }
  return true;
}

function validateField(
  field: SettingField,
  value: string | number | boolean
): string | null {
  if (field.kind === "secret") return null;
  const v = field.validation;
  if (!v) {
    // Built-in number sanity even without explicit validation block
    if (field.type === "number" && typeof value === "number") {
      if (!Number.isFinite(value)) return "Must be a valid number";
    }
    return null;
  }
  if (v.required) {
    if (value === "" || value === null || value === undefined) {
      return "Required";
    }
  }
  if (field.type === "number" && typeof value === "number") {
    if (v.min !== undefined && value < v.min) {
      return `Min ${v.min}`;
    }
    if (v.max !== undefined && value > v.max) {
      return `Max ${v.max}`;
    }
  }
  if (v.pattern && (typeof value === "string" || typeof value === "number")) {
    try {
      const re = new RegExp(v.pattern);
      if (!re.test(String(value))) return "Invalid format";
    } catch {
      // Ignore bad patterns from config
    }
  }
  return null;
}

export function SettingsForm() {
  const [configs, setConfigs] = useState<WorkerConfigManifest[]>([]);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [baseline, setBaseline] = useState<SettingsMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthMap>({});
  const [activeWorker, setActiveWorker] = useState<string>("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const workerNames = DEFAULT_WORKER_LIST.filter((w) => w.enabled).map(
          (w) => w.name
        );
        const [loadedConfigs, loadedSettings, healthRes] = await Promise.all([
          loadAllConfigs(workerNames),
          loadMergedSettings(workerNames),
          fetch("/api/workers/health", { signal: controller.signal }).catch(
            () => null
          ),
        ]);

        if (!controller.signal.aborted) {
          setConfigs(loadedConfigs);
          setSettings(loadedSettings);
          setBaseline(cloneSettings(loadedSettings));
          if (loadedConfigs.length > 0) {
            setActiveWorker((prev) => prev || loadedConfigs[0].worker);
          }
          if (healthRes && healthRes.ok) {
            const data = (await healthRes.json()) as {
              workers: WorkerHealthMap;
            };
            setWorkerHealth(data.workers);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Failed to load settings:", err);
          toast.error("Failed to load settings");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const isDirty = useMemo(
    () => !settingsEqual(settings, baseline),
    [settings, baseline]
  );

  const dirtyWorkers = useMemo(() => {
    const dirty = new Set<string>();
    for (const worker of Object.keys(settings)) {
      const af = settings[worker] ?? {};
      const bf = baseline[worker] ?? {};
      const keys = new Set([...Object.keys(af), ...Object.keys(bf)]);
      for (const key of keys) {
        if (af[key] !== bf[key]) {
          dirty.add(worker);
          break;
        }
      }
    }
    return dirty;
  }, [settings, baseline]);

  const handleChange = useCallback(
    (worker: string, key: string, value: string | number | boolean) => {
      setSettings((prev) => ({
        ...prev,
        [worker]: {
          ...prev[worker],
          [key]: value,
        },
      }));
      // Live-clear error when user edits
      setFieldErrors((prev) => {
        const errKey = `${worker}:${key}`;
        if (!prev[errKey]) return prev;
        const next = { ...prev };
        delete next[errKey];
        return next;
      });
    },
    []
  );

  const runValidation = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    for (const cfg of configs) {
      for (const section of cfg.sections) {
        for (const field of section.fields) {
          const value = settings[cfg.worker]?.[field.key] ?? field.default;
          const msg = validateField(field, value);
          if (msg) errors[`${cfg.worker}:${field.key}`] = msg;
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [configs, settings]);

  const handleDiscard = () => {
    setSettings(cloneSettings(baseline));
    setFieldErrors({});
    toast.message("Changes discarded", {
      description: "Reverted to last saved configuration.",
    });
  };

  const handleSave = async () => {
    if (!runValidation()) {
      toast.error("Fix validation errors before saving", {
        description: "Some fields have invalid values.",
      });
      return;
    }

    const controller = new AbortController();
    setIsSaving(true);
    let skippedCount = 0;

    // Build a set of "section:key" for secret fields so we skip them.
    // (S-3: secret fields must not be POSTed to /api/settings.)
    const secretKeys = new Set<string>();
    for (const cfg of configs) {
      for (const section of cfg.sections) {
        for (const f of section.fields) {
          if (f.kind === "secret") secretKeys.add(f.key);
        }
      }
    }

    // Build the batched payload: { settings: { [worker]: { [key]: value } } }
    // Single round-trip instead of N sequential POSTs.
    // Only send dirty (non-secret) fields to reduce noise.
    const batch: SettingsMap = {};
    for (const [worker, fields] of Object.entries(settings)) {
      const base = baseline[worker] ?? {};
      for (const [key, value] of Object.entries(fields)) {
        if (secretKeys.has(key)) {
          skippedCount++;
          continue;
        }
        if (base[key] === value) continue;
        (batch[worker] ??= {})[key] = value;
      }
    }

    const totalFields = Object.values(batch).reduce(
      (n, fields) => n + Object.keys(fields).length,
      0
    );

    if (totalFields === 0) {
      setIsSaving(false);
      toast.message("Nothing to save", {
        description:
          skippedCount > 0
            ? "Only secret fields differ — set those via CLI."
            : "No configuration changes detected.",
      });
      return;
    }

    try {
      const res = await fetch(`/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: batch }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as { written?: number };
        const written = data.written ?? totalFields;
        setBaseline(cloneSettings(settings));
        setLastSavedAt(Date.now());
        toast.success("Settings saved successfully", {
          description:
            skippedCount > 0
              ? `${written} setting(s) synced to workers. ${skippedCount} secret field(s) skipped (set via CLI).`
              : `${written} setting(s) synced to workers.`,
        });
      } else {
        const error = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error("Failed to save settings", {
          description: error.error ?? "Check console for details.",
        });
        console.error("Settings save error:", error);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast.error("Failed to save settings", {
          description: "Check console for details.",
        });
        console.error("Settings save error:", err);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (worker: string, field: SettingField) => {
    const value = settings[worker]?.[field.key] ?? field.default;
    const isSecret = field.kind === "secret";
    const isDangerous = field.kind === "dangerous";
    const errKey = `${worker}:${field.key}`;
    const error = fieldErrors[errKey];

    // S-3: secret fields are read-only. Render a disabled input with a
    // "Configure via CLI" hint and the exact command to run.
    if (isSecret) {
      return (
        <Field className="rounded-md border border-border/50 bg-secondary/15 p-3">
          <FieldLabel className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            {field.label}
            <Badge variant="secondary" className="font-normal text-xs">
              Secret — CLI only
            </Badge>
          </FieldLabel>
          <Input
            type="text"
            value={String(value)}
            disabled
            readOnly
            placeholder="•••••• (set via CLI)"
            className="bg-secondary/30 font-mono text-muted-foreground"
          />
          {field.cliCommand && (
            <FieldDescription>
              <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs">
                {field.cliCommand}
              </code>
            </FieldDescription>
          )}
          {field.description && !field.cliCommand && (
            <FieldDescription>{field.description}</FieldDescription>
          )}
        </Field>
      );
    }

    switch (field.type) {
      case "boolean":
        return (
          <div
            className={cn(
              "flex items-center justify-between rounded-md p-4",
              isDangerous
                ? "border border-warning/30 bg-warning/5"
                : "bg-secondary/30"
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                {field.label}
                {isDangerous ? (
                  <Badge
                    variant="outline"
                    className="border-warning/40 text-[10px] text-warning"
                  >
                    Sensitive
                  </Badge>
                ) : null}
              </span>
              {field.description && (
                <span className="text-xs text-muted-foreground">
                  {field.description}
                </span>
              )}
            </div>
            <Switch
              checked={value as boolean}
              onCheckedChange={(checked) =>
                handleChange(worker, field.key, checked)
              }
            />
          </div>
        );

      case "number":
        return (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel>
              {field.label}
              {isDangerous ? (
                <Badge
                  variant="outline"
                  className="ml-2 border-warning/40 text-[10px] text-warning"
                >
                  Sensitive
                </Badge>
              ) : null}
            </FieldLabel>
            <Input
              type="number"
              value={value as number}
              onChange={(e) =>
                handleChange(
                  worker,
                  field.key,
                  e.target.value === "" ? 0 : parseFloat(e.target.value) || 0
                )
              }
              placeholder={String(field.placeholder)}
              className={cn(
                "bg-secondary/50",
                error && "border-destructive focus-visible:ring-destructive/30"
              )}
              aria-invalid={!!error}
              min={field.validation?.min}
              max={field.validation?.max}
            />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : field.description ? (
              <FieldDescription>{field.description}</FieldDescription>
            ) : null}
          </Field>
        );

      case "select":
        return (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel>{field.label}</FieldLabel>
            <Select
              value={String(value)}
              onValueChange={(newValue) =>
                handleChange(worker, field.key, newValue)
              }
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error ? (
              <FieldError>{error}</FieldError>
            ) : field.description ? (
              <FieldDescription>{field.description}</FieldDescription>
            ) : null}
          </Field>
        );

      case "json":
      case "textarea":
        return (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel>{field.label}</FieldLabel>
            <Textarea
              value={String(value)}
              onChange={(e) => handleChange(worker, field.key, e.target.value)}
              placeholder={String(field.placeholder)}
              className="min-h-[80px] bg-secondary/50 font-mono text-sm"
            />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : field.description ? (
              <FieldDescription>{field.description}</FieldDescription>
            ) : null}
          </Field>
        );

      default:
        return (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel>{field.label}</FieldLabel>
            <Input
              type="text"
              value={String(value)}
              onChange={(e) => handleChange(worker, field.key, e.target.value)}
              placeholder={String(field.placeholder)}
              className={cn(
                "bg-secondary/50",
                error && "border-destructive focus-visible:ring-destructive/30"
              )}
              aria-invalid={!!error}
            />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : field.description ? (
              <FieldDescription>{field.description}</FieldDescription>
            ) : null}
          </Field>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-10 w-full max-w-[400px] rounded-lg" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  const healthyCount = Object.values(workerHealth).filter(
    (h) => h.kvReachable
  ).length;
  const healthKnown = Object.keys(workerHealth).length;
  const errorCount = Object.keys(fieldErrors).length;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium">
                Connected Workers
              </CardTitle>
              <CardDescription>
                CONFIG_KV reachability per worker binding
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {healthKnown > 0 ? (
                <span className="flex items-center gap-1.5">
                  <CircleDot className="h-3 w-3 text-success" />
                  {healthyCount}/{healthKnown} reachable
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CircleDot className="h-3 w-3 text-muted-foreground" />
                  Health unknown
                </span>
              )}
              {lastSavedAt ? (
                <>
                  <span className="text-border">·</span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Saved {new Date(lastSavedAt).toLocaleTimeString()}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_WORKER_LIST.map((worker) => {
              const health = workerHealth[worker.name];
              // Health states:
              //   green: CONFIG_KV reachable (worker can read/write)
              //   red:   worker missing CONFIG_KV binding (unreachable)
              //   gray:  health endpoint didn't return a status
              const dotClass = !health
                ? "bg-muted-foreground"
                : health.kvReachable
                  ? "bg-success"
                  : "bg-destructive";
              const tooltip = !health
                ? "Health endpoint unreachable"
                : health.kvReachable
                  ? "CONFIG_KV reachable"
                  : `Unreachable: ${health.error ?? "missing CONFIG_KV binding"}`;
              return (
                <Badge
                  key={worker.name}
                  variant={worker.enabled ? "default" : "secondary"}
                  className={worker.enabled ? "bg-primary/20 text-primary" : ""}
                  title={tooltip}
                >
                  <span
                    className={`mr-1.5 h-1.5 w-1.5 rounded-full ${dotClass}`}
                  />
                  {worker.displayName}
                  {dirtyWorkers.has(worker.name) ? (
                    <span
                      className="ml-1.5 h-1.5 w-1.5 rounded-full bg-warning"
                      title="Unsaved changes"
                    />
                  ) : null}
                </Badge>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> KV ok
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />{" "}
              Unreachable
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />{" "}
              Unknown
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Unsaved
            </span>
          </div>
        </CardContent>
      </Card>

      {configs.length === 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No worker configs loaded</AlertTitle>
          <AlertDescription className="text-xs">
            Dashboard manifests under{" "}
            <code className="font-mono">public/workers/*.jsonc</code> were empty
            or failed to parse. Check the setup wizard and deploy worker
            dashboard configs.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs
          value={activeWorker || configs[0].worker}
          onValueChange={setActiveWorker}
          className="w-full"
        >
          <TabsList className="mb-4 flex h-auto flex-wrap gap-2 bg-transparent p-0">
            {configs.map((config) => (
              <TabsTrigger
                key={config.worker}
                value={config.worker}
                className="border border-border bg-card shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <span className="flex items-center gap-1.5">
                  {config.displayName}
                  {dirtyWorkers.has(config.worker) ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-warning"
                      title="Unsaved changes"
                    />
                  ) : null}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {configs.map((config) => {
            const secretFields = config.sections.flatMap((s) =>
              s.fields.filter((f) => f.kind === "secret")
            );
            const editableCount = config.sections.reduce(
              (n, s) => n + s.fields.filter((f) => f.kind !== "secret").length,
              0
            );

            return (
              <TabsContent
                key={config.worker}
                value={config.worker}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-secondary/15 px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {config.displayName}
                    </p>
                    {config.description ? (
                      <p className="text-xs text-muted-foreground">
                        {config.description}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Worker config sections from dashboard.jsonc
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge
                      variant="outline"
                      className="font-normal text-[10px]"
                    >
                      {config.sections.length} sections
                    </Badge>
                    <Badge
                      variant="outline"
                      className="font-normal text-[10px]"
                    >
                      {editableCount} editable
                    </Badge>
                    {secretFields.length > 0 ? (
                      <Badge
                        variant="secondary"
                        className="font-normal text-[10px]"
                      >
                        {secretFields.length} secrets (CLI)
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {config.sections.map((section: DashboardSection) => {
                  const Icon = section.icon
                    ? ICON_MAP[section.icon] || Zap
                    : Zap;
                  const booleans = section.fields.filter(
                    (f) => f.type === "boolean" && f.kind !== "secret"
                  );
                  const secrets = section.fields.filter(
                    (f) => f.kind === "secret"
                  );
                  const others = section.fields.filter(
                    (f) => f.type !== "boolean" && f.kind !== "secret"
                  );

                  return (
                    <Card
                      key={`${config.worker}-${section.id}`}
                      className="border-border bg-card"
                    >
                      <CardHeader className="pb-4">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                          <div className="flex flex-col gap-1">
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                              <Icon className="h-5 w-5 text-primary" />
                              {section.title}
                              {section.priority !== undefined && (
                                <Badge
                                  variant="secondary"
                                  className="ml-2 font-normal text-xs"
                                >
                                  Priority {section.priority}
                                </Badge>
                              )}
                            </CardTitle>
                            <CardDescription>
                              {section.description}
                            </CardDescription>
                          </div>
                          <Badge
                            variant="outline"
                            className="w-fit font-mono text-[10px] font-normal"
                          >
                            {section.fields.length} fields
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-6">
                        {booleans.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                              Toggles
                            </p>
                            <FieldGroup>
                              {booleans.map((field) => (
                                <div key={field.key}>
                                  {renderField(config.worker, field)}
                                </div>
                              ))}
                            </FieldGroup>
                          </div>
                        ) : null}

                        {others.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {booleans.length > 0 || secrets.length > 0 ? (
                              <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                                Values
                              </p>
                            ) : null}
                            <FieldGroup>
                              {others.map((field) => (
                                <div key={field.key}>
                                  {renderField(config.worker, field)}
                                </div>
                              ))}
                            </FieldGroup>
                          </div>
                        ) : null}

                        {secrets.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                              Secrets
                            </p>
                            <FieldGroup>
                              {secrets.map((field) => (
                                <div key={field.key}>
                                  {renderField(config.worker, field)}
                                </div>
                              ))}
                            </FieldGroup>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* Sticky save bar — only feels present when there is work to do */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/90 px-4 py-3 backdrop-blur-md transition-all",
          isDirty || isSaving
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0"
        )}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              {isDirty ? "Unsaved configuration changes" : "All changes saved"}
            </p>
            <p className="text-xs text-muted-foreground">
              {errorCount > 0
                ? `${errorCount} field(s) need attention before save.`
                : dirtyWorkers.size > 0
                  ? `${dirtyWorkers.size} worker tab(s) modified · secrets never leave the CLI.`
                  : "Edit any field above to enable save."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={handleDiscard}
              disabled={isSaving || !isDirty}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Discard
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !isDirty || errorCount > 0}
              className="gap-2"
            >
              {isSaving ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save configuration
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
