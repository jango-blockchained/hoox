"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  PartyPopper,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { WIZARD_STEPS } from "./setup-config";
import { markSetupCompleted } from "./setup-progress";
import { WizardStepIndicator } from "./steps/step-indicator";
import { WizardWelcomeStep } from "./steps/welcome";
import { WizardWorkersStep } from "./steps/workers";
import { WizardSecretsStep } from "./steps/secrets";
import { WizardWebhookStep } from "./steps/webhook";
import { WizardDoneStep } from "./steps/done";
import { api } from "@/lib/api";

const TOTAL_STEPS = WIZARD_STEPS.length;
const LAST_STEP = TOTAL_STEPS - 1;
const STEP_STORAGE_KEY = "hoox_setup_step";

/**
 * Steps that are "critical" for a production-ready first run.
 * Index maps to WIZARD_STEPS:
 *   0 welcome (skippable once acknowledged)
 *   1 workers (critical — need at least one healthy service)
 *   2 secrets (critical — internal keys / webhook)
 *   3 webhook (recommended, not hard-blocked)
 *   4 done
 */
const CRITICAL_STEP_IDS = new Set(["workers", "secrets"]);

interface SetupWizardProps {
  /** When true, the wizard finishes by going to /dashboard instead of re-running. */
  autoRedirectOnComplete?: boolean;
}

interface StepGate {
  /** Whether Next is allowed without override. */
  canProceed: boolean;
  /** Soft warning shown under the footer when blocked. */
  reason?: string;
  /** Allow "Continue anyway" for non-fatal failures. */
  allowOverride: boolean;
}

export function SetupWizard({
  autoRedirectOnComplete = true,
}: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [acknowledgedWelcome, setAcknowledgedWelcome] = useState(false);
  const [workersHealthy, setWorkersHealthy] = useState<boolean | null>(null);
  const [criticalSecretsOk, setCriticalSecretsOk] = useState<boolean | null>(
    null
  );
  const [overrideGate, setOverrideGate] = useState(false);
  const [checkingGate, setCheckingGate] = useState(false);

  // Restore last step from session (not localStorage — setup completion is permanent)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STEP_STORAGE_KEY);
      if (raw !== null) {
        const n = Number.parseInt(raw, 10);
        if (Number.isFinite(n) && n >= 0 && n <= LAST_STEP) {
          setStep(n);
          if (n > 0) setAcknowledgedWelcome(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STEP_STORAGE_KEY, String(step));
    } catch {
      // ignore
    }
  }, [step]);

  const refreshGates = useCallback(async () => {
    setCheckingGate(true);
    try {
      const [hk, secrets] = await Promise.all([
        api.getHousekeeping().catch(() => null),
        api.getSecretsStatus().catch(() => null),
      ]);

      if (hk && !("error" in hk && hk.error) && Array.isArray(hk.checks)) {
        const checks = hk.checks as { status?: string }[];
        const ok =
          checks.length === 0 ||
          checks.some((c) => c.status === "ok" || c.status === "healthy");
        // If payload used issues[] shape instead
        setWorkersHealthy(ok || checks.length === 0);
      } else if (hk && Array.isArray((hk as { issues?: unknown[] }).issues)) {
        const issues = (hk as { issues: { type?: string }[] }).issues;
        setWorkersHealthy(!issues.some((i) => i.type === "error"));
      } else {
        // Housekeeping unavailable — don't hard-block; treat as unknown
        setWorkersHealthy(null);
      }

      if (secrets?.success && Array.isArray(secrets.secrets)) {
        // Critical secrets: webhook + at least one internal auth key if present
        const criticalNames = [
          "WEBHOOK_API_KEY_BINDING",
          "API_SERVICE_KEY_BINDING",
          "D1_READ_KEY_BINDING",
        ];
        const synced = new Set(
          secrets.secrets.filter((s) => s.synced).map((s) => s.name)
        );
        const known = new Set(secrets.secrets.map((s) => s.name));
        // Only require secrets the status endpoint knows about
        const required = criticalNames.filter((n) => known.has(n));
        if (required.length === 0) {
          setCriticalSecretsOk(null);
        } else {
          setCriticalSecretsOk(required.every((n) => synced.has(n)));
        }
      } else {
        setCriticalSecretsOk(null);
      }
    } finally {
      setCheckingGate(false);
    }
  }, []);

  useEffect(() => {
    void refreshGates();
  }, [refreshGates, step]);

  const isFirst = step === 0;
  const isLast = step === LAST_STEP;
  const currentStep = WIZARD_STEPS[step];
  const progressPercent = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  const gate: StepGate = useMemo(() => {
    if (overrideGate) {
      return { canProceed: true, allowOverride: false };
    }
    const id = currentStep?.id;
    if (id === "welcome" && !acknowledgedWelcome) {
      // Welcome is always proceedable via "Start setup"
      return { canProceed: true, allowOverride: false };
    }
    if (id === "workers") {
      if (workersHealthy === false) {
        return {
          canProceed: false,
          reason:
            "No healthy workers detected. Fix connectivity or continue anyway if you're setting up offline.",
          allowOverride: true,
        };
      }
      return { canProceed: true, allowOverride: false };
    }
    if (id === "secrets") {
      if (criticalSecretsOk === false) {
        return {
          canProceed: false,
          reason:
            "Critical secrets (webhook / internal auth / D1 read) are missing. Configure them via CLI, or continue with limited functionality.",
          allowOverride: true,
        };
      }
      return { canProceed: true, allowOverride: false };
    }
    return { canProceed: true, allowOverride: false };
  }, [
    overrideGate,
    currentStep?.id,
    acknowledgedWelcome,
    workersHealthy,
    criticalSecretsOk,
  ]);

  const goNext = () => {
    if (step === 0) setAcknowledgedWelcome(true);
    if (!gate.canProceed) {
      toast.error("Complete this step first", {
        description: gate.reason,
      });
      return;
    }
    setOverrideGate(false);
    if (isLast) {
      finish();
      return;
    }
    setStep((s) => Math.min(s + 1, LAST_STEP));
  };

  const goBack = () => {
    setOverrideGate(false);
    setStep((s) => Math.max(s - 1, 0));
  };

  const skip = () => {
    if (currentStep && CRITICAL_STEP_IDS.has(currentStep.id) && !overrideGate) {
      toast.warning("This step is recommended", {
        description:
          "Use “Continue anyway” if you understand the impact, or finish configuring first.",
      });
      return;
    }
    markSetupCompleted();
    try {
      sessionStorage.removeItem(STEP_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (autoRedirectOnComplete) router.push("/dashboard");
  };

  const continueAnyway = () => {
    setOverrideGate(true);
    toast.message("Proceeding with incomplete setup", {
      description: "You can re-run the wizard from Setup anytime.",
    });
  };

  const finish = () => {
    markSetupCompleted();
    try {
      sessionStorage.removeItem(STEP_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (autoRedirectOnComplete) router.push("/dashboard");
  };

  return (
    <Card className="border-border bg-card shadow-2xl shadow-primary/5 backdrop-blur-xl">
      <CardHeader className="border-b border-border/50 pb-4">
        <WizardStepIndicator steps={WIZARD_STEPS} currentStep={step} />
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">{currentStep?.title}</CardTitle>
              <CardDescription className="mt-1">
                {currentStep?.description}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                Step {step + 1} of {TOTAL_STEPS}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {progressPercent}% complete
              </span>
            </div>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <StepContent
          step={step}
          onWorkersRechecked={refreshGates}
          onSecretsRechecked={refreshGates}
        />
      </CardContent>

      {!gate.canProceed && gate.reason ? (
        <div className="border-t border-border/50 px-4 pt-4">
          <Alert className="border-warning/40 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-sm">Step incomplete</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 text-xs">
              <span>{gate.reason}</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshGates()}
                  disabled={checkingGate}
                >
                  Re-check
                </Button>
                {gate.allowOverride ? (
                  <Button size="sm" variant="ghost" onClick={continueAnyway}>
                    Continue anyway
                  </Button>
                ) : null}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {gate.canProceed && overrideGate && !isLast ? (
        <div className="border-t border-border/50 px-4 pt-4">
          <Alert className="border-border bg-secondary/20">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <AlertTitle className="text-sm">Override active</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              You chose to continue with incomplete checks. Next will advance.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border/50 p-4">
        <div>
          {!isFirst && (
            <Button variant="ghost" onClick={goBack}>
              <ArrowLeft />
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isLast && (
            <Button
              variant="outline"
              onClick={skip}
              title={
                currentStep && CRITICAL_STEP_IDS.has(currentStep.id)
                  ? "Critical step — use Continue anyway first"
                  : "Skip remaining setup"
              }
            >
              Skip for now
            </Button>
          )}
          {isLast && (
            <Button variant="outline" onClick={skip}>
              Close
            </Button>
          )}
          <Button onClick={goNext} disabled={!gate.canProceed && !overrideGate}>
            {isLast ? (
              <>
                Finish
                <PartyPopper />
              </>
            ) : (
              <>
                {step === 0 ? "Start setup" : "Next"}
                <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StepContent({
  step,
  onWorkersRechecked,
  onSecretsRechecked,
}: {
  step: number;
  onWorkersRechecked?: () => void;
  onSecretsRechecked?: () => void;
}) {
  switch (step) {
    case 0:
      return <WizardWelcomeStep />;
    case 1:
      return <WizardWorkersStep onChecked={onWorkersRechecked} />;
    case 2:
      return <WizardSecretsStep onChecked={onSecretsRechecked} />;
    case 3:
      return <WizardWebhookStep />;
    case 4:
      return <WizardDoneStep />;
    default:
      return null;
  }
}
