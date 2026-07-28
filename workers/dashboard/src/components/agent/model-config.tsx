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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FieldGroup } from "@/components/ui/field";
import { toast } from "sonner";
import { useState } from "react";

const PROVIDERS = ["workers-ai", "openai", "anthropic", "google", "azure"];

interface ConfigResponse {
  success: boolean;
  error?: string;
}

export function ModelConfig() {
  const [defaultProvider, setDefaultProvider] = useState("workers-ai");
  const fallbackChain = ["workers-ai", "openai"];
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const controller = new AbortController();
    setSaving(true);
    try {
      const res = await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProvider,
          fallbackChain,
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as ConfigResponse;
      if (data.success) {
        toast.success("Configuration saved");
      } else {
        toast.error(data.error || "Save failed");
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast.error("Failed to save configuration");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Provider Configuration</CardTitle>
        <CardDescription>Configure AI provider settings</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Default Provider</FieldLabel>
            <Select value={defaultProvider} onValueChange={setDefaultProvider}>
              <SelectTrigger>
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
            <div className="flex gap-2 flex-wrap">
              {fallbackChain.map((p, i) => (
                <div
                  key={i}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-sm"
                >
                  {p}
                </div>
              ))}
            </div>
            <FieldDescription>
              Providers tried in order on failure
            </FieldDescription>
          </Field>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Spinner className="h-4 w-4" data-icon="inline-start" />{" "}
                Saving...
              </>
            ) : (
              "Save Configuration"
            )}
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
