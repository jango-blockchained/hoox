/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Check, PartyPopper, Zap } from "lucide-react";

const CHECKLIST = [
  "Workers deployed and reachable",
  "Secrets synced to Cloudflare Secret Store",
  "TradingView webhook URL configured",
];

/**
 * Wizard step 5: completion summary.
 */
export function WizardDoneStep() {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="bg-success/10 text-success flex size-16 items-center justify-center rounded-2xl shadow-lg shadow-success/20">
        <PartyPopper className="size-8" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          You&apos;re all set
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          Your system is configured. You can always come back to this page to
          review the setup or re-run the wizard.
        </p>
      </div>
      <ul className="text-muted-foreground mt-2 space-y-2 text-left text-sm">
        {CHECKLIST.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <Check className="text-success" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Zap className="text-warning mt-4 size-6" />
    </div>
  );
}
