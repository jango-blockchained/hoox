/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Check, PartyPopper, Settings, Zap } from "lucide-react";

const CHECKLIST = [
  {
    title: "Workers",
    body: "Edge services verified (or intentionally deferred)",
  },
  {
    title: "Secrets",
    body: "Keys managed via CLI / Secret Store",
  },
  {
    title: "Webhook",
    body: "TradingView URL ready to paste into alerts",
  },
] as const;

/**
 * Wizard step 5: completion summary.
 */
export function WizardDoneStep() {
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="bg-success/10 text-success flex size-16 items-center justify-center rounded-2xl shadow-lg shadow-success/20">
        <PartyPopper className="size-8" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          You&apos;re all set
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          Your system is ready for live signals. Re-open this page anytime to
          review infrastructure or re-run the wizard.
        </p>
      </div>
      <ul className="mt-1 w-full max-w-md space-y-2 text-left text-sm">
        {CHECKLIST.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-3 rounded-md border border-border/50 bg-secondary/20 px-3 py-2.5"
          >
            <Check className="text-success mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="text-muted-foreground text-xs">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center justify-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="text-warning size-3.5" />
          Head to the dashboard overview next
        </span>
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Settings className="size-3.5" />
          Tune workers under Settings
        </span>
      </div>
    </div>
  );
}
