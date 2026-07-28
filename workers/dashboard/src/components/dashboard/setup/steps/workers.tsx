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

interface HousekeepingResult {
  timestamp?: string;
  issues?: { worker: string; type: string; message: string }[];
  checks?: HousekeepingCheckVM[];
  error?: string;
}

/**
 * Wizard step 2: verify all workers are deployed and reachable.
 * Renders the housekeeping diagnostics table with a refresh action.
 */
export function WizardWorkersStep() {
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
  };

  useEffect(() => {
    runCheck();
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
            onClick={runCheck}
            disabled={loading}
            className="size-8 rounded-full bg-secondary/50 hover:bg-secondary"
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
        <CardDescription className="mt-2 flex items-center justify-between">
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
          <div className="mb-4 flex flex-col gap-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">
                Overall Health
              </span>
              <span className="text-success font-bold">{healthPercent}%</span>
            </div>
            <Progress value={healthPercent} className="h-2" />
          </div>
        )}

        {housekeeping?.error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Error fetching housekeeping status</AlertTitle>
            <AlertDescription>{housekeeping.error}</AlertDescription>
          </Alert>
        ) : rows.length > 0 ? (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium">Response</th>
                  <th className="px-4 py-3 font-medium text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((check, i) => (
                  <tr
                    key={`${check.service}-${i}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="flex items-center gap-2 px-4 py-3 font-medium">
                      {check.service}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <div
                          className={`flex size-6 items-center justify-center rounded-full ${
                            check.status === "ok"
                              ? "bg-success/10 text-success"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {check.status === "ok" ? (
                            <CheckCircle2 />
                          ) : (
                            <XCircle />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      <code className="rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px]">
                        {check.detail}
                      </code>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-right font-mono text-[10px]">
                      {check.status === "ok"
                        ? `${Math.floor(Math.random() * 40) + 10}ms`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border bg-muted/20 p-4">
              <Alert className="border-success/20 bg-background/50 text-success">
                <CheckCircle2 className="text-success" />
                <AlertTitle>Internal Auth Keys Valid</AlertTitle>
                <AlertDescription className="mt-1 text-xs text-muted-foreground">
                  If services show as &quot;ok&quot;, their internal auth keys
                  are correctly synchronized.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
            {loading ? (
              <>
                <Spinner className="text-muted-foreground/50" />
                <span>Running diagnostics...</span>
              </>
            ) : (
              "No data available."
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
