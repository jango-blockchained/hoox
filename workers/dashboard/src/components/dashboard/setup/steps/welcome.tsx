/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Clock, KeyRound, Server, Sparkles, Webhook } from "lucide-react";

const PREVIEW = [
  {
    icon: Server,
    title: "Workers",
    body: "Confirm edge services are deployed and responding.",
  },
  {
    icon: KeyRound,
    title: "Secrets",
    body: "Sync webhook, exchange, and internal auth keys via CLI.",
  },
  {
    icon: Webhook,
    title: "Webhook",
    body: "Point TradingView alerts at your gateway URL.",
  },
] as const;

/**
 * Wizard step 1: welcome screen with intro and step preview.
 */
export function WizardWelcomeStep() {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl shadow-lg shadow-primary/20">
        <Sparkles className="size-8" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Welcome to Hoox
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          Let&apos;s get your edge trading system set up. We&apos;ll verify
          workers, configure secrets, and connect TradingView webhooks.
        </p>
        <p className="text-muted-foreground mt-2 inline-flex items-center gap-1.5 text-xs">
          <Clock className="size-3.5" />
          About 2 minutes · critical steps can&apos;t be skipped casually
        </p>
      </div>

      <ol className="grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
        {PREVIEW.map((item, idx) => {
          const Icon = item.icon;
          return (
            <li
              key={item.title}
              className="flex flex-col gap-2 rounded-lg border border-border/60 bg-secondary/20 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-md text-xs font-bold">
                  {idx + 1}
                </span>
                <Icon className="text-primary size-4" />
                <span className="text-sm font-medium">{item.title}</span>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {item.body}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
