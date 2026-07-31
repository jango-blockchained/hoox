"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type { HousekeepingCheckVM } from "../setup-config";
import { cn } from "@/lib/utils";

interface HousekeepingResult {
  timestamp?: string;
  issues?: { worker: string; type: string; message: string }[];
  checks?: HousekeepingCheckVM[];
  error?: string;
}

interface WizardWorkersStepProps {
  onChecked?: () => void;
}

/**
 * Wizard step 2: verify all workers are deployed and reachable.
 * Renders the housekeeping diagnostics table with a refresh action.
 */
export function WizardWorkersStep({ onChecked }: WizardWorkersStepProps) {
  const [housekeeping, setHousekeeping] = useState<HousekeepingResult | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const runCheck = async () => {
    setLoading(true);
    try {
      const res = await api.getHousekeeping();
      setHousekeeping(res as HousekeepingResult);
    } catch (e) {
      setHousekeeping({ error: String(e) });
    }
    setLoading(false);
    onChecked?.();
  };

  useEffect(() => {
    void runCheck();
  }, []);

  const rows: HousekeepingCheckVM[] = (() => {
    if (housekeeping?.checks) return housekeeping.checks;
    if (housekeeping?.issues) {
      return housekeeping.issues.map((i) => ({
        service: i.worker,
        status: i.type === "error" ? ("error" as const) : ("ok" as const),
        detail: i.message,
      }));
    }
    return [];
  })();

  const healthyCount = rows.filter((c) => c.status === "ok").length;
  const errorCount = rows.filter((c) => c.status === "error").length;
  const healthPercent = rows.length
    ? Math.round((healthyCount / rows.length) * 100)
    : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="text-success" />
            Service Connections
          </CardTitle>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => void runCheck()}
            disabled={loading}
            className="size-8 rounded-full bg-secondary/50 hover:bg-secondary"
            aria-label="Re-run diagnostics"
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
        <CardDescription className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span>Automated housekeeping diagnostics</span>
          {housekeeping?.timestamp && (
            <span className="flex items-center gap-1.5 text-xs">
              <Clock className="size-3" />
              {loading
                ? "Checking..."
                : `Checked ${formatDistanceToNow(new Date(housekeeping.timestamp), { addSuffix: true })}`}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pt-4">
        {rows.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground font-medium">
                Overall health
              </span>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[10px]",
                    healthPercent === 100
                      ? "border-success/40 text-success"
                      : healthPercent >= 50
                        ? "border-warning/40 text-warning"
                        : "border-destructive/40 text-destructive"
                  )}
                >
                  {healthyCount}/{rows.length} ok
                </Badge>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    healthPercent === 100
                      ? "text-success"
                      : healthPercent >= 50
                        ? "text-warning"
                        : "text-destructive"
                  )}
                >
                  {healthPercent}%
                </span>
              </div>
            </div>
            <Progress value={healthPercent} className="h-2" />
            {errorCount > 0 ? (
              <p className="text-xs text-warning">
                {errorCount} service(s) degraded — Next is blocked until you
                re-check or choose Continue anyway.
              </p>
            ) : null}
          </div>
        )}

        {housekeeping?.error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Error fetching housekeeping status</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>{housekeeping.error}</span>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runCheck()}
                  disabled={loading}
                >
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : rows.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((check, i) => (
                  <tr
                    key={`${check.service}-${i}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{check.service}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <div
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full",
                            check.status === "ok"
                              ? "bg-success/10 text-success"
                              : "bg-destructive/10 text-destructive"
                          )}
                          title={check.status === "ok" ? "Healthy" : "Error"}
                        >
                          {check.status === "ok" ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : (
                            <XCircle className="size-3.5" />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      <code className="rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px]">
                        {check.detail}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border bg-muted/20 p-4">
              <Alert className="border-success/20 bg-background/50">
                <CheckCircle2 className="text-success" />
                <AlertTitle className="text-success">
                  Internal auth check
                </AlertTitle>
                <AlertDescription className="mt-1 text-xs text-muted-foreground">
                  Services marked ok typically mean internal auth keys are
                  synchronized. Failures often mean a missing binding or secret.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex min-h-[200px] flex-col items-center justify-center gap-3 py-12 text-sm">
            {loading ? (
              <>
                <Spinner className="text-muted-foreground/50" />
                <span>Running diagnostics...</span>
              </>
            ) : (
              <>
                <span>No housekeeping data available.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runCheck()}
                >
                  Run check
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
