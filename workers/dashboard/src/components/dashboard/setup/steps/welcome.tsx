/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sparkles } from "lucide-react";

/**
 * Wizard step 1: welcome screen with intro and start prompt.
 */
export function WizardWelcomeStep() {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl shadow-lg shadow-primary/20">
        <Sparkles className="size-8" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Welcome to Hoox
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          Let&apos;s get your edge trading system set up. We&apos;ll walk you
          through verifying workers, configuring secrets, and connecting
          TradingView webhooks. Takes about 2 minutes.
        </p>
      </div>
    </div>
  );
}
