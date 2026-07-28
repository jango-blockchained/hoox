"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Cloud, CloudOff, Copy, Terminal } from "lucide-react";
import { api } from "@/lib/api";
import {
  REQUIRED_SECRETS,
  buildSecretCommand,
  generateExampleSecret,
  groupSecretsByCategory,
  type SecretStatus,
} from "../setup-config";
import { CircularProgress } from "../setup-circular-progress";

/**
 * Wizard step 3: configure required API keys and CLI commands.
 * Shows the configuration progress and per-secret CLI snippets.
 */
export function WizardSecretsStep() {
  const [secretsList, setSecretsList] = useState<SecretStatus[]>(() =>
    REQUIRED_SECRETS.map((req) => ({
      ...req,
      example: "...",
      configured: false,
    }))
  );

  const checkSecretsStatus = async () => {
    try {
      const res = await api.getSecretsStatus();
      if (res.success && res.secrets) {
        setSecretsList((prev) =>
          prev.map((req) => ({
            ...req,
            example: generateExampleSecret(req.secret),
            configured: res.secrets.some(
              (s) => s.name === req.secret && s.synced
            ),
          }))
        );
      }
    } catch {
      setSecretsList((prev) =>
        prev.map((req) => ({
          ...req,
          example: generateExampleSecret(req.secret),
          configured: false,
        }))
      );
    }
  };

  useEffect(() => {
    checkSecretsStatus();
  }, []);

  const configuredCount = secretsList.filter((s) => s.configured).length;
  const missing = secretsList.filter((s) => !s.configured);

  const copyAllMissing = () => {
    const cmds = missing
      .map((req) => buildSecretCommand(req.secret, req.worker, req.example))
      .join(" && ");
    navigator.clipboard.writeText(cmds);
    toast.success("All commands copied!", {
      description: "Paste into your terminal to configure all missing secrets.",
    });
  };

  const grouped = groupSecretsByCategory(secretsList);

  return (
    <Card>
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <CardTitle>Required Secrets</CardTitle>
            <CardDescription>
              Internal keys are synced to dashboard automatically
            </CardDescription>
          </div>

          <div className="flex items-center gap-4 rounded-full border border-border/50 bg-secondary/20 p-2 pr-4">
            <CircularProgress
              value={configuredCount}
              total={secretsList.length}
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">
                Configuration
              </span>
              <span className="text-xs text-muted-foreground">
                {configuredCount} of {secretsList.length} Set
              </span>
            </div>
          </div>
        </div>

        {missing.length > 0 && (
          <div className="mt-4 flex justify-end border-t border-border/50 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
              onClick={copyAllMissing}
            >
              <Terminal />
              Copy All Missing Commands
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pt-6">
        {Object.entries(grouped).map(([group, secrets]) => (
          <div key={group} className="flex flex-col gap-3">
            <h3 className="border-b border-border pb-2 text-sm font-semibold text-foreground">
              {group}
            </h3>
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
              {secrets.map((req) => {
                const cmd = buildSecretCommand(
                  req.secret,
                  req.worker,
                  req.example
                );
                return (
                  <div
                    key={req.secret}
                    className={`group p-4 transition-colors ${
                      req.configured ? "bg-muted/30" : "hover:bg-muted/10"
                    }`}
                  >
                    <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {req.configured ? (
                            <Cloud className="text-success shrink-0" />
                          ) : (
                            <CloudOff className="text-muted-foreground shrink-0" />
                          )}
                          <span
                            className={`text-sm font-medium ${
                              req.configured ? "text-muted-foreground" : ""
                            }`}
                          >
                            {req.secret}
                          </span>
                          {req.configured && (
                            <Badge
                              variant="outline"
                              className="ml-2 h-5 border-success bg-success/10 px-1.5 text-success"
                            >
                              Synced
                            </Badge>
                          )}
                        </div>
                        <p className="pl-6 text-xs text-muted-foreground">
                          {req.desc}
                        </p>
                      </div>
                      <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
                        <Badge variant="secondary" className="w-fit">
                          {req.worker}
                        </Badge>
                      </div>
                    </div>

                    <SecretCommandBlock command={cmd} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <Alert className="mt-6 border-border bg-muted/50">
          <AlertTriangle className="text-warning" />
          <AlertTitle>Secret Management</AlertTitle>
          <AlertDescription className="mt-1 text-xs text-muted-foreground">
            Secrets are directly loaded from your Cloudflare Secret Store. Run
            the CLI command:{" "}
            <code className="rounded border border-border bg-background px-1 py-0.5 font-[family-name:var(--font-geist-mono)] text-[10px]">
              bun run scripts/manage.ts secrets update-cf &lt;key&gt;
              &lt;worker&gt;
            </code>{" "}
            to manage them securely.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function SecretCommandBlock({ command }: { command: string }) {
  const copy = () => {
    navigator.clipboard.writeText(command);
    toast.success("Command copied!", {
      description: "Paste it in your terminal",
    });
  };

  return (
    <div className="group/cmd relative mt-3 flex items-center justify-between gap-3 overflow-hidden rounded-md border border-border/50 bg-[#1e1e1e] p-2.5">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500 opacity-50" />
      <div className="flex w-full items-center gap-3 overflow-x-auto pl-2">
        <Terminal className="text-muted-foreground size-3.5 shrink-0" />
        <code className="font-[family-name:var(--font-geist-mono)] whitespace-nowrap text-[11px] text-muted-foreground">
          <span className="text-primary">bun run</span> scripts/manage.ts
          secrets update-cf{" "}
          <span className="text-success">{command.split(" ")[5]}</span>{" "}
          <span className="text-warning">{command.split(" ")[6]}</span>{" "}
          <span className="text-neutral-400">
            &quot;
            {command.split('"')[1] ?? ""}
            &quot;
          </span>
        </code>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 bg-white/5 px-2 text-white hover:bg-white/10"
        onClick={copy}
      >
        <Copy />
        <span className="text-[10px]">Copy</span>
      </Button>
    </div>
  );
}
