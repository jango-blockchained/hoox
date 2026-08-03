"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
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
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FieldGroup } from "@/components/ui/field";
import { toast } from "sonner";
import { useEffect, useState } from "react";

interface ConfigResponse {
  success: boolean;
  config?: {
    maxDailyDrawdownPercent?: number;
    trailingStopPercent?: number;
    takeProfitPercent?: number;
  };
  error?: string;
}

export function RiskParameters() {
  const [drawdown, setDrawdown] = useState(-5);
  const [trailingStop, setTrailingStop] = useState(5);
  const [takeProfit, setTakeProfit] = useState(10);
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
          if (data.config.maxDailyDrawdownPercent != null) {
            setDrawdown(data.config.maxDailyDrawdownPercent);
          }
          if (data.config.trailingStopPercent != null) {
            setTrailingStop(
              Math.round(data.config.trailingStopPercent * 1000) / 10
            );
          }
          if (data.config.takeProfitPercent != null) {
            setTakeProfit(
              Math.round(data.config.takeProfitPercent * 1000) / 10
            );
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error("Failed to load risk parameters");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxDailyDrawdownPercent: drawdown,
          trailingStopPercent: trailingStop / 100,
          takeProfitPercent: takeProfit / 100,
        }),
      });
      const data = (await res.json()) as ConfigResponse;
      if (data.success) {
        toast.success("Risk parameters saved");
        setDirty(false);
      } else {
        toast.error(data.error || "Save failed");
      }
    } catch {
      toast.error("Failed to save parameters");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">Risk Parameters</CardTitle>
        <CardDescription>Configure risk management settings</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>
                Max Daily Drawdown:{" "}
                <span className="font-mono text-destructive">{drawdown}%</span>
              </FieldLabel>
              <Slider
                value={[drawdown]}
                onValueChange={(v) => {
                  setDrawdown(v[0]);
                  setDirty(true);
                }}
                min={-10}
                max={0}
                step={0.5}
                className="w-full"
                disabled={saving}
                aria-label="Max daily drawdown"
              />
              <FieldDescription>
                Account will stop trading at this loss percentage
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>
                Trailing Stop:{" "}
                <span className="font-mono">{trailingStop}%</span>
              </FieldLabel>
              <Slider
                value={[trailingStop]}
                onValueChange={(v) => {
                  setTrailingStop(v[0]);
                  setDirty(true);
                }}
                min={1}
                max={20}
                step={0.5}
                className="w-full"
                disabled={saving}
                aria-label="Trailing stop percent"
              />
              <FieldDescription>
                Automatic stop-loss based on highest profit watermark
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>
                Take Profit: <span className="font-mono">{takeProfit}%</span>
              </FieldLabel>
              <Slider
                value={[takeProfit]}
                onValueChange={(v) => {
                  setTakeProfit(v[0]);
                  setDirty(true);
                }}
                min={1}
                max={50}
                step={1}
                className="w-full"
                disabled={saving}
                aria-label="Take profit percent"
              />
              <FieldDescription>
                Automatic partial close when position reaches profit target
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
                "Save Parameters"
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
