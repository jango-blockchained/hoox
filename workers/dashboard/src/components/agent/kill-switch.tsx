"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Shield, ShieldOff } from "lucide-react";
import { useState } from "react";

interface KillSwitchProps {
  active: boolean;
  onToggle: (
    action: "engage_kill_switch" | "release_kill_switch"
  ) => Promise<void>;
}

export function KillSwitch({ active, onToggle }: KillSwitchProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await onToggle(active ? "release_kill_switch" : "engage_kill_switch");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Alert variant={active ? "destructive" : "default"}>
      {active ? (
        <ShieldOff className="h-4 w-4" />
      ) : (
        <Shield className="h-4 w-4" />
      )}
      <AlertTitle>Kill Switch: {active ? "ACTIVE" : "Inactive"}</AlertTitle>
      <AlertDescription className="mt-2">
        {active
          ? "Trading is currently blocked due to drawdown limits."
          : "Kill switch is currently disabled. Trading is allowed."}
        <div className="mt-3">
          <Button
            variant={active ? "default" : "destructive"}
            onClick={handleToggle}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Spinner className="h-4 w-4" data-icon="inline-start" />{" "}
                Processing...
              </>
            ) : (
              <>
                {active ? (
                  <>
                    <Shield className="h-4 w-4" data-icon="inline-start" />{" "}
                    Release Kill Switch
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-4 w-4" data-icon="inline-start" />{" "}
                    Engage Kill Switch
                  </>
                )}
              </>
            )}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
