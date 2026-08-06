/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const WEBHOOK_PATH = "/webhook/tradingview";
const EXAMPLE_URL = `https://hoox.[your-prefix].workers.dev${WEBHOOK_PATH}`;

/**
 * Wizard step 4: connect TradingView webhooks.
 */
export function WizardWebhookStep() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(EXAMPLE_URL);
    setCopied(true);
    toast.success("Webhook URL template copied");
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-primary/5 border-primary/20 flex items-start gap-3 rounded-md border p-4">
        <Webhook className="text-primary mt-0.5 size-5 shrink-0" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">TradingView webhook URL</h3>
            <Badge variant="secondary" className="font-normal text-[10px]">
              Recommended
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Set this URL as the Webhook URL on your TradingView alerts. The
            gateway authenticates each request with{" "}
            <code className="bg-background rounded border px-1 font-mono text-[10px]">
              WEBHOOK_API_KEY_BINDING
            </code>{" "}
            (created by{" "}
            <code className="bg-background rounded border px-1 font-mono text-[10px]">
              hoox keys generate
            </code>
            ).
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border/50 bg-[#1e1e1e] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-[10px] font-semibold">
            Webhook URL format
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-white hover:bg-white/10"
            onClick={copy}
          >
            {copied ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <Copy className="size-3.5" />
            )}
            <span className="text-[10px]">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
        <code className="text-primary block break-all font-mono text-xs">
          {EXAMPLE_URL}
        </code>
      </div>

      <ol className="text-muted-foreground list-decimal space-y-2 pl-5 text-xs">
        <li>
          Open TradingView → Alerts → Webhook URL and paste the gateway URL
          (replace <code className="font-mono">[your-prefix]</code>).
        </li>
        <li>
          Include your API key header or query param as configured for{" "}
          <code className="font-mono">WEBHOOK_API_KEY_BINDING</code>.
        </li>
        <li>
          Fire a test alert and confirm it appears on the{" "}
          <a
            href="/dashboard/signals"
            className="text-primary inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
          >
            Signals
            <ExternalLink className="size-3" />
          </a>{" "}
          page.
        </li>
      </ol>
    </div>
  );
}
