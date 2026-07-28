/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Webhook } from "lucide-react";

/**
 * Wizard step 4: connect TradingView webhooks.
 */
export function WizardWebhookStep() {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-primary/5 border-primary/20 flex items-start gap-3 rounded-md border p-4">
        <Webhook className="text-primary mt-0.5 size-5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold">TradingView Webhook URL</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Set this URL as the Webhook URL on your TradingView alerts. The
            gateway will authenticate each request using your{" "}
            <code className="bg-background rounded border px-1 font-mono text-[10px]">
              WEBHOOK_API_KEY_BINDING
            </code>
            .
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border/50 bg-[#1e1e1e] p-3">
        <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold">
          Webhook URL Format:
        </p>
        <code className="text-primary block break-all font-mono text-xs">
          https://hoox.[your-prefix].workers.dev/webhook/tradingview
        </code>
      </div>

      <p className="text-muted-foreground text-xs">
        After you&apos;ve configured your first TradingView alert, head over to
        the{" "}
        <a
          href="/dashboard/signals"
          className="text-primary font-medium underline-offset-2 hover:underline"
        >
          Signals
        </a>{" "}
        page to confirm incoming payloads.
      </p>
    </div>
  );
}
