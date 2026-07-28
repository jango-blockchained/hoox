"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
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
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
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
} from "lucide-react";
import type { WorkerConfigManifest } from "@/lib/settings/loader";
import { loadAllConfigs, loadMergedSettings } from "@/lib/settings/loader";
import type { DashboardSection, SettingField } from "@/lib/settings/types";
import { DEFAULT_WORKER_LIST } from "@/lib/settings/workers";

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

export function SettingsForm() {
  const [configs, setConfigs] = useState<WorkerConfigManifest[]>([]);
  const [settings, setSettings] = useState<
    Record<string, Record<string, string | number | boolean>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthMap>({});

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

  const handleChange = (
    worker: string,
    key: string,
    value: string | number | boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      [worker]: {
        ...prev[worker],
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
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
    const batch: Record<string, Record<string, string | number | boolean>> = {};
    for (const [worker, fields] of Object.entries(settings)) {
      for (const [key, value] of Object.entries(fields)) {
        if (secretKeys.has(key)) {
          skippedCount++;
          continue;
        }
        (batch[worker] ??= {})[key] = value;
      }
    }

    const totalFields = Object.values(batch).reduce(
      (n, fields) => n + Object.keys(fields).length,
      0
    );

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

    // S-3: secret fields are read-only. Render a disabled input with a
    // "Configure via CLI" hint and the exact command to run.
    if (isSecret) {
      return (
        <Field>
          <FieldLabel className="flex items-center gap-2">
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
          <div className="flex items-center justify-between rounded-md bg-secondary/30 p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {field.label}
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
          <Field>
            <FieldLabel>{field.label}</FieldLabel>
            <Input
              type="number"
              value={value as number}
              onChange={(e) =>
                handleChange(worker, field.key, parseFloat(e.target.value) || 0)
              }
              placeholder={String(field.placeholder)}
              className="bg-secondary/50"
            />
            {field.description && (
              <FieldDescription>{field.description}</FieldDescription>
            )}
          </Field>
        );

      case "select":
        return (
          <Field>
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
            {field.description && (
              <FieldDescription>{field.description}</FieldDescription>
            )}
          </Field>
        );

      case "json":
      case "textarea":
        return (
          <Field>
            <FieldLabel>{field.label}</FieldLabel>
            <Textarea
              value={String(value)}
              onChange={(e) => handleChange(worker, field.key, e.target.value)}
              placeholder={String(field.placeholder)}
              className="min-h-[80px] bg-secondary/50 font-mono text-sm"
            />
            {field.description && (
              <FieldDescription>{field.description}</FieldDescription>
            )}
          </Field>
        );

      default:
        return (
          <Field>
            <FieldLabel>{field.label}</FieldLabel>
            <Input
              type="text"
              value={String(value)}
              onChange={(e) => handleChange(worker, field.key, e.target.value)}
              placeholder={String(field.placeholder)}
              className="bg-secondary/50"
            />
            {field.description && (
              <FieldDescription>{field.description}</FieldDescription>
            )}
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

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Connected Workers
          </CardTitle>
          <CardDescription>Services connected to the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_WORKER_LIST.map((worker) => {
              const health = workerHealth[worker.name];
              // Health states:
              //   green: CONFIG_KV reachable (worker can read/write)
              //   red:   worker missing CONFIG_KV binding (unreachable)
              //   gray:  health endpoint didn't return a status (e.g. /api/workers/health not yet reachable in dev)
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
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {configs.length > 0 && (
        <Tabs defaultValue={configs[0].worker} className="w-full">
          <TabsList className="mb-4 flex flex-wrap h-auto gap-2 bg-transparent p-0">
            {configs.map((config) => (
              <TabsTrigger
                key={config.worker}
                value={config.worker}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border border-border bg-card shadow-sm"
              >
                {config.displayName}
              </TabsTrigger>
            ))}
          </TabsList>

          {configs.map((config) => (
            <TabsContent
              key={config.worker}
              value={config.worker}
              className="flex flex-col gap-6"
            >
              {config.sections.map((section: DashboardSection) => {
                const Icon = section.icon ? ICON_MAP[section.icon] || Zap : Zap;
                return (
                  <Card
                    key={`${config.worker}-${section.id}`}
                    className="bg-card border-border"
                  >
                    <CardHeader className="pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                      </div>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        {section.fields.map((field: SettingField) => (
                          <div key={field.key}>
                            {renderField(config.worker, field)}
                          </div>
                        ))}
                      </FieldGroup>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <div className="flex justify-end pt-4">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? (
            <>
              <Spinner className="h-4 w-4" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Configuration
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
