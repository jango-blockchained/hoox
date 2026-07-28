"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, PartyPopper } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WIZARD_STEPS } from "./setup-config";
import { markSetupCompleted } from "./setup-progress";
import { WizardStepIndicator } from "./steps/step-indicator";
import { WizardWelcomeStep } from "./steps/welcome";
import { WizardWorkersStep } from "./steps/workers";
import { WizardSecretsStep } from "./steps/secrets";
import { WizardWebhookStep } from "./steps/webhook";
import { WizardDoneStep } from "./steps/done";

const TOTAL_STEPS = WIZARD_STEPS.length;
const LAST_STEP = TOTAL_STEPS - 1;

interface SetupWizardProps {
  /** When true, the wizard finishes by going to /dashboard instead of re-running. */
  autoRedirectOnComplete?: boolean;
}

export function SetupWizard({
  autoRedirectOnComplete = true,
}: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const isFirst = step === 0;
  const isLast = step === LAST_STEP;
  const currentStep = WIZARD_STEPS[step];

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    setStep((s) => Math.min(s + 1, LAST_STEP));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const skip = () => {
    markSetupCompleted();
    if (autoRedirectOnComplete) router.push("/dashboard");
  };

  const finish = () => {
    markSetupCompleted();
    if (autoRedirectOnComplete) router.push("/dashboard");
  };

  return (
    <Card className="border-border bg-card shadow-2xl shadow-primary/5 backdrop-blur-xl">
      <CardHeader className="border-b border-border/50 pb-4">
        <WizardStepIndicator steps={WIZARD_STEPS} currentStep={step} />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{currentStep?.title}</CardTitle>
            <CardDescription className="mt-1">
              {currentStep?.description}
            </CardDescription>
          </div>
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Step {step + 1} of {TOTAL_STEPS}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <StepContent step={step} />
      </CardContent>

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
          <Button variant="outline" onClick={skip}>
            {isLast ? "Close" : "Skip for now"}
          </Button>
          <Button onClick={goNext}>
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

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 0:
      return <WizardWelcomeStep />;
    case 1:
      return <WizardWorkersStep />;
    case 2:
      return <WizardSecretsStep />;
    case 3:
      return <WizardWebhookStep />;
    case 4:
      return <WizardDoneStep />;
    default:
      return null;
  }
}
