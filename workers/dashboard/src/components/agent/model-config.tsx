"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FieldGroup } from "@/components/ui/field";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const PROVIDERS = ["workers-ai", "openai", "anthropic", "google", "azure"];

interface ConfigResponse {
  success: boolean;
  config?: {
    defaultProvider?: string;
    fallbackChain?: string[];
  };
  error?: string;
}

export function ModelConfig() {
  const [defaultProvider, setDefaultProvider] = useState("workers-ai");
  const [fallbackChain, setFallbackChain] = useState<string[]>([
    "workers-ai",
    "openai",
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/agent/config", {
          signal: controller.signal,
        });
        const data = (await res.json()) as ConfigResponse;
        if (data.success && data.config) {
          if (data.config.defaultProvider) {
            setDefaultProvider(data.config.defaultProvider);
          }
          if (
            data.config.fallbackChain &&
            data.config.fallbackChain.length > 0
          ) {
            setFallbackChain(data.config.fallbackChain);
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error("Failed to load model configuration");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const handleProviderChange = (value: string) => {
    setDefaultProvider(value);
    // Keep default provider first in fallback chain
    setFallbackChain((prev) => {
      const rest = prev.filter((p) => p !== value);
      return [value, ...rest];
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProvider,
          fallbackChain,
        }),
      });
      const data = (await res.json()) as ConfigResponse;
      if (data.success) {
        toast.success("Configuration saved");
        setDirty(false);
      } else {
        toast.error(data.error || "Save failed");
      }
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">Provider Configuration</CardTitle>
        <CardDescription>Configure AI provider settings</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>Default Provider</FieldLabel>
              <Select
                value={defaultProvider}
                onValueChange={handleProviderChange}
                disabled={saving}
              >
                <SelectTrigger aria-label="Default provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Primary AI provider for agent operations
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Fallback Chain</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {fallbackChain.map((p, i) => (
                  <div
                    key={`${p}-${i}`}
                    className="rounded-lg bg-secondary px-3 py-1.5 text-sm"
                  >
                    <span className="mr-1.5 text-xs text-muted-foreground">
                      {i + 1}.
                    </span>
                    {p}
                  </div>
                ))}
              </div>
              <FieldDescription>
                Providers tried in order on failure (default is always first)
              </FieldDescription>
            </Field>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              className="w-full"
            >
              {saving ? (
                <>
                  <Spinner className="h-4 w-4" data-icon="inline-start" />
                  Saving…
                </>
              ) : dirty ? (
                "Save Configuration"
              ) : (
                "No changes"
              )}
            </Button>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
