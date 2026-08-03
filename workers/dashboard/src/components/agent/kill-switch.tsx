"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { AlertTriangle, Shield, ShieldOff } from "lucide-react";
import { useState } from "react";

interface KillSwitchProps {
  active: boolean;
  onToggle: (
    action: "engage_kill_switch" | "release_kill_switch"
  ) => Promise<void>;
  className?: string;
}

export function KillSwitch({ active, onToggle, className }: KillSwitchProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onToggle(active ? "release_kill_switch" : "engage_kill_switch");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Alert
      variant={active ? "destructive" : "default"}
      className={cn(
        active && "border-destructive/80 bg-destructive/10",
        !active && "border-border",
        className
      )}
    >
      {active ? (
        <ShieldOff className="h-4 w-4" />
      ) : (
        <Shield className="h-4 w-4" />
      )}
      <AlertTitle className="flex items-center gap-2">
        Kill Switch: {active ? "ACTIVE" : "Inactive"}
        {active && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground">
            <AlertTriangle className="size-3" aria-hidden />
            Trading blocked
          </span>
        )}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p>
          {active
            ? "All trading is blocked. Release only after reviewing drawdown and open risk."
            : "Trading is allowed. Engaging the kill switch immediately blocks new trades."}
        </p>
        <div className="mt-3">
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant={active ? "default" : "destructive"}
                disabled={loading}
                className={cn(
                  "w-full",
                  !active &&
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                )}
              >
                {loading ? (
                  <>
                    <Spinner className="h-4 w-4" data-icon="inline-start" />
                    Processing...
                  </>
                ) : active ? (
                  <>
                    <Shield className="h-4 w-4" data-icon="inline-start" />
                    Release Kill Switch
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-4 w-4" data-icon="inline-start" />
                    Engage Kill Switch
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle
                    className={cn(
                      "size-5",
                      active ? "text-primary" : "text-destructive"
                    )}
                  />
                  {active ? "Release kill switch?" : "Engage kill switch?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {active
                    ? "This will re-enable trading. Confirm that risk limits and open positions are under control before releasing."
                    : "This will immediately block all trading activity. Open positions are not closed automatically — only new trade execution is halted."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleConfirm();
                  }}
                  disabled={loading}
                  className={
                    active
                      ? undefined
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  }
                >
                  {loading ? (
                    <>
                      <Spinner className="h-4 w-4" data-icon="inline-start" />
                      Confirming...
                    </>
                  ) : active ? (
                    "Yes, release"
                  ) : (
                    "Yes, engage kill switch"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </AlertDescription>
    </Alert>
  );
}
