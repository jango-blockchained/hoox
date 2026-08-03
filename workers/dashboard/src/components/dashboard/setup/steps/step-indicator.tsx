"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "../setup-config";

interface WizardStepIndicatorProps {
  steps: WizardStep[];
  currentStep: number;
}

export function WizardStepIndicator({
  steps,
  currentStep,
}: WizardStepIndicatorProps) {
  const lastIndex = steps.length - 1;

  return (
    <ol
      className="flex w-full items-center"
      aria-label="Setup progress"
      role="list"
    >
      {steps.map((step, idx) => {
        const Icon: LucideIcon = step.icon;
        const completed = idx < currentStep;
        const active = idx === currentStep;
        const isLast = idx === lastIndex;

        return (
          <li
            key={step.id}
            className={cn("flex flex-1 items-center", isLast && "flex-none")}
          >
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border-2 transition-all duration-300",
                  completed && "border-success bg-success/10 text-success",
                  active &&
                    "border-primary bg-primary/10 text-primary scale-105 shadow-lg shadow-primary/20",
                  !completed &&
                    !active &&
                    "border-border bg-muted/30 text-muted-foreground"
                )}
                aria-current={active ? "step" : undefined}
                title={step.description}
              >
                {completed ? (
                  <Check className="size-4" />
                ) : (
                  <Icon className="size-4" />
                )}
              </div>
              <span
                className={cn(
                  "hidden text-[10px] font-medium tracking-wide uppercase sm:inline",
                  active && "text-foreground",
                  completed && "text-success",
                  !active && !completed && "text-muted-foreground"
                )}
              >
                {step.title}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "mx-2 h-0.5 flex-1 rounded-full transition-colors duration-300",
                  idx < currentStep ? "bg-success" : "bg-border"
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
