"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
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
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  RefreshCw,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  CRITICAL_SECRET_NAMES,
  MESH_AUTOMATE_COMMAND,
  MESH_SYNC_COMMAND,
  REQUIRED_SECRETS,
  SECRETS_LIST_COMMAND,
  buildSecretSetCommand,
  groupSecretsByCategory,
  systemSecrets,
  userSecrets,
  type SecretPriority,
  type SecretStatus,
} from "../setup-config";
import { CircularProgress } from "../setup-circular-progress";

interface WizardSecretsStepProps {
  onChecked?: () => void;
}

/**
 * Wizard step: automate mesh keys, then set integration secrets via CLI.
 *
 * Mesh path (no values in the UI):
 *   `hoox keys generate && hoox secrets sync --system`
 *
 * Operator path (interactive prompt — never paste secrets into the dashboard):
 *   `hoox secrets set <worker> <name>`
 */
export function WizardSecretsStep({ onChecked }: WizardSecretsStepProps) {
  const [secretsList, setSecretsList] = useState<SecretStatus[]>(() =>
    REQUIRED_SECRETS.map((req) => ({
      ...req,
      configured: false,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const checkSecretsStatus = async () => {
    setLoading(true);
    setStatusError(null);
    try {
      const res = await api.getSecretsStatus();
      if (res.success && res.secrets) {
        const synced = new Set(
          res.secrets.filter((s) => s.synced).map((s) => s.name)
        );
        setSecretsList(
          REQUIRED_SECRETS.map((req) => ({
            ...req,
            // Treat secret as configured if exact name is synced, or (for
            // INTERNAL_KEY_BINDING) any of the mesh aliases are present.
            configured:
              synced.has(req.secret) ||
              (req.secret === "INTERNAL_KEY_BINDING" &&
                (synced.has("API_SERVICE_KEY_BINDING") ||
                  synced.has("AGENT_INTERNAL_KEY"))),
          }))
        );
      } else {
        setStatusError(
          "Could not read Secret Store status. Check CLOUDFLARE_* env on the dashboard worker."
        );
      }
    } catch {
      setStatusError(
        "Secrets status request failed. You can still run the CLI commands below."
      );
      setSecretsList(
        REQUIRED_SECRETS.map((req) => ({
          ...req,
          configured: false,
        }))
      );
    }
    setLoading(false);
    onChecked?.();
  };

  useEffect(() => {
    void checkSecretsStatus();
  }, []);

  const systemList = systemSecrets(secretsList);
  const userList = userSecrets(secretsList);
  const systemConfigured = systemList.filter((s) => s.configured).length;
  const userConfigured = userList.filter((s) => s.configured).length;
  const configuredCount = secretsList.filter((s) => s.configured).length;
  const criticalMissing = secretsList.filter(
    (s) => CRITICAL_SECRET_NAMES.has(s.secret) && !s.configured
  );
  const missingUser = userList.filter((s) => !s.configured);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`, {
        description: "Paste into your monorepo terminal",
      });
    } catch {
      toast.error("Clipboard unavailable", {
        description: "Select and copy the command manually",
      });
    }
  };

  const copyMissingUserCommands = () => {
    if (missingUser.length === 0) {
      toast.message("No missing integration secrets");
      return;
    }
    const cmds = missingUser
      .map((s) => buildSecretSetCommand(s.worker, s.secret))
      .join("\n");
    void copyText(cmds, "Integration secret commands");
  };

  const grouped = groupSecretsByCategory(secretsList);
  const groupOrder: Array<keyof typeof grouped> = [
    "Mesh (auto)",
    "Exchange API Keys",
    "Notifications",
    "Integrations",
  ];

  return (
    <Card>
      <CardHeader className="border-b border-border/50 pb-3">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              Secrets
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => void checkSecretsStatus()}
                disabled={loading}
                aria-label="Refresh secrets status"
              >
                <RefreshCw
                  className={loading ? "size-3.5 animate-spin" : "size-3.5"}
                />
              </Button>
            </CardTitle>
            <CardDescription>
              Automate mesh auth keys in one shot, then set exchange / bot
              tokens interactively via the CLI — never paste live secrets here.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-full border border-border/50 bg-secondary/20 p-2 pr-4">
              <CircularProgress
                value={systemConfigured}
                total={systemList.length || 1}
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">
                  Mesh
                </span>
                <span className="text-xs text-muted-foreground">
                  {systemConfigured}/{systemList.length} system
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-border/50 bg-secondary/20 p-2 pr-4">
              <CircularProgress
                value={userConfigured}
                total={userList.length || 1}
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">
                  Integrations
                </span>
                <span className="text-xs text-muted-foreground">
                  {userConfigured}/{userList.length} set
                </span>
              </div>
            </div>
          </div>
        </div>

        {statusError ? (
          <Alert className="mt-4 border-border bg-muted/40">
            <AlertTriangle className="text-warning" />
            <AlertTitle className="text-sm">Status unavailable</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              {statusError}
            </AlertDescription>
          </Alert>
        ) : null}

        {criticalMissing.length > 0 ? (
          <Alert className="mt-4 border-warning/40 bg-warning/5">
            <AlertTriangle className="text-warning" />
            <AlertTitle className="text-sm">
              {criticalMissing.length} critical mesh secret(s) missing
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Run the automation command below, then hit Refresh. Next stays
              gated until webhook + mesh auth are present (or you continue
              anyway).
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="mt-4 border-success/30 bg-success/5">
            <CheckCircle2 className="text-success" />
            <AlertTitle className="text-sm">
              Critical mesh keys look set
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              {configuredCount} of {secretsList.length} catalog secrets
              detected. Finish any exchange / Telegram keys you need for live
              trading.
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-6 pt-6">
        {/* Automated mesh path */}
        <section className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Wand2 className="size-4" />
              </span>
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  1. Automate mesh keys
                  <Badge
                    variant="outline"
                    className="border-primary/30 text-primary h-5 px-1.5 text-[10px]"
                  >
                    Recommended
                  </Badge>
                </h3>
                <p className="text-muted-foreground mt-1 max-w-xl text-xs leading-relaxed">
                  Generates a shared internal mesh key, webhook key, and session
                  secret, writes{" "}
                  <code className="font-mono text-[10px]">.dev.vars</code> for
                  every worker, then syncs{" "}
                  <strong className="text-foreground font-medium">only</strong>{" "}
                  system secrets to Cloudflare (skips exchange keys & bot
                  tokens).
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() =>
                void copyText(MESH_AUTOMATE_COMMAND, "Mesh automation command")
              }
            >
              <Copy className="size-3.5" />
              Copy command
            </Button>
          </div>

          <CommandBlock
            command={MESH_AUTOMATE_COMMAND}
            highlight="auto"
            onCopy={() =>
              void copyText(MESH_AUTOMATE_COMMAND, "Mesh automation command")
            }
          />

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void copyText(MESH_SYNC_COMMAND, "Mesh re-sync command")
              }
            >
              <Terminal className="size-3.5" />
              Copy re-sync only
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void checkSecretsStatus()}
              disabled={loading}
            >
              <RefreshCw
                className={loading ? "size-3.5 animate-spin" : "size-3.5"}
              />
              I ran it — refresh status
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void copyText(SECRETS_LIST_COMMAND, "Secrets list command")
              }
            >
              <Sparkles className="size-3.5" />
              Copy list command
            </Button>
          </div>
        </section>

        {/* Integration secrets */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">
                2. Integration secrets (operator values)
              </h3>
              <p className="text-muted-foreground text-xs">
                Interactive{" "}
                <code className="font-mono text-[10px]">
                  hoox secrets set &lt;worker&gt; &lt;name&gt;
                </code>{" "}
                — the CLI prompts for the value (hidden) and syncs to
                Cloudflare.
              </p>
            </div>
            {missingUser.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={copyMissingUserCommands}
              >
                <Terminal className="size-3.5" />
                Copy missing set commands
              </Button>
            ) : null}
          </div>
        </section>

        {groupOrder.map((group) => {
          const secrets = grouped[group];
          if (!secrets?.length) return null;
          const isMesh = group === "Mesh (auto)";
          return (
            <div key={group} className="flex flex-col gap-3">
              <h3 className="border-b border-border pb-2 text-sm font-semibold text-foreground">
                {group}
                {isMesh ? (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    covered by automation above
                  </span>
                ) : null}
              </h3>
              <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
                {secrets.map((req) => {
                  const critical = CRITICAL_SECRET_NAMES.has(req.secret);
                  const cmd =
                    req.kind === "system"
                      ? MESH_AUTOMATE_COMMAND
                      : buildSecretSetCommand(req.worker, req.secret);
                  return (
                    <div
                      key={`${req.worker}:${req.secret}`}
                      className={`group p-4 transition-colors ${
                        req.configured ? "bg-muted/30" : "hover:bg-muted/10"
                      }`}
                    >
                      <div className="mb-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {req.configured ? (
                              <Cloud className="size-4 shrink-0 text-success" />
                            ) : (
                              <CloudOff className="text-muted-foreground size-4 shrink-0" />
                            )}
                            <span
                              className={`font-mono text-sm font-medium ${
                                req.configured ? "text-muted-foreground" : ""
                              }`}
                            >
                              {req.secret}
                            </span>
                            <PriorityBadge priority={req.priority} />
                            {critical && !req.configured ? (
                              <Badge
                                variant="outline"
                                className="h-5 border-warning/40 px-1.5 text-warning"
                              >
                                Critical
                              </Badge>
                            ) : null}
                            {req.configured ? (
                              <Badge
                                variant="outline"
                                className="h-5 border-success bg-success/10 px-1.5 text-success"
                              >
                                Synced
                              </Badge>
                            ) : null}
                            {req.kind === "system" ? (
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px]"
                              >
                                auto
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground pl-6 text-xs">
                            {req.desc}
                          </p>
                        </div>
                        <Badge variant="secondary" className="w-fit shrink-0">
                          {req.worker}
                        </Badge>
                      </div>

                      {!req.configured ? (
                        <CommandBlock
                          command={cmd}
                          highlight={req.kind === "system" ? "auto" : "set"}
                          compact
                          onCopy={() =>
                            void copyText(
                              cmd,
                              req.kind === "system"
                                ? "Mesh automation command"
                                : `Set ${req.secret}`
                            )
                          }
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <Alert className="border-border bg-muted/50">
          <Terminal className="text-muted-foreground" />
          <AlertTitle>CLI reference</AlertTitle>
          <AlertDescription className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <p>
              <code className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
                hoox keys generate
              </code>{" "}
              → write mesh keys to{" "}
              <code className="font-mono text-[10px]">.keys/</code> and each
              worker&apos;s{" "}
              <code className="font-mono text-[10px]">.dev.vars</code>
            </p>
            <p>
              <code className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
                hoox secrets sync --system
              </code>{" "}
              → upload only mesh / webhook / session secrets (alias:{" "}
              <code className="font-mono text-[10px]">--required</code>)
            </p>
            <p>
              <code className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
                hoox secrets set trade-worker BINANCE_KEY_BINDING
              </code>{" "}
              → interactive put (hidden prompt) + Cloudflare sync
            </p>
            <p>
              <code className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
                hoox secrets list
              </code>{" "}
              → declared secrets by worker
            </p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: SecretPriority }) {
  if (priority === "critical") return null;
  if (priority === "recommended") {
    return (
      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
        Recommended
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground h-5 px-1.5 text-[10px]"
    >
      Optional
    </Badge>
  );
}

function CommandBlock({
  command,
  onCopy,
  highlight = "set",
  compact = false,
}: {
  command: string;
  onCopy: () => void;
  highlight?: "auto" | "set";
  compact?: boolean;
}) {
  return (
    <div
      className={`group/cmd relative flex items-center justify-between gap-3 overflow-hidden rounded-md border border-border/50 bg-[#1e1e1e] ${
        compact ? "mt-2 p-2" : "p-2.5"
      }`}
    >
      <div
        className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b opacity-60 ${
          highlight === "auto"
            ? "from-orange-500 to-amber-400"
            : "from-blue-500 to-purple-500"
        }`}
      />
      <div className="flex w-full items-center gap-3 overflow-x-auto pl-2">
        <Terminal className="text-muted-foreground size-3.5 shrink-0" />
        <code className="font-mono whitespace-nowrap text-[11px] text-neutral-300">
          {highlight === "auto" ? (
            <>
              <span className="text-primary">hoox</span> keys generate{" "}
              <span className="text-neutral-500">&&</span>{" "}
              <span className="text-primary">hoox</span> secrets sync{" "}
              <span className="text-success">--system</span>
            </>
          ) : (
            <>
              <span className="text-primary">hoox</span> secrets set{" "}
              <span className="text-warning">{command.split(" ")[3]}</span>{" "}
              <span className="text-success">{command.split(" ")[4]}</span>
            </>
          )}
        </code>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 bg-white/5 px-2 text-white hover:bg-white/10"
        onClick={onCopy}
      >
        <Copy className="size-3.5" />
        <span className="text-[10px]">Copy</span>
      </Button>
    </div>
  );
}
