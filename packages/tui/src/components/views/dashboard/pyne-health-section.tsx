/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
import { useState, useCallback, useEffect } from "react";
import { Colors, WorkerStatusColor } from "@hoox-sh/hoox-shared";
import { StatusDot } from "../../shared/status-dot";
import { cliBridge } from "../../../services/cli-bridge";
import type { PyneHealthResult } from "../../../services/cli-bridge";

const POLL_MS = 30_000;

function statusToDot(
  status: PyneHealthResult["status"]
): "operational" | "degraded" | "down" {
  if (status === "healthy") return "operational";
  if (status === "degraded") return "degraded";
  return "down";
}

/**
 * Compact PYNE edge evaluate health row for the TUI dashboard.
 * Polls `hoox pyne health` via the CLI bridge.
 */
export function PyneHealthSection() {
  const [result, setResult] = useState<PyneHealthResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await cliBridge.pyneHealthCheck();
    if (res.data) {
      setResult(res.data);
    } else {
      setResult({
        worker: "pyne-worker",
        url: "",
        status: "down",
        error: res.stderr || "probe failed",
        timestamp: new Date().toISOString(),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const status = result?.status ?? "down";
  const dot = statusToDot(status);
  const color = WorkerStatusColor[dot];

  return (
    <box flexDirection="column" gap={0} paddingTop={1}>
      <text fg={Colors.muted} dim>
        PYNE EDGE
      </text>
      <box flexDirection="row" gap={1} paddingLeft={1}>
        <StatusDot status={dot} pulse={status === "healthy"} />
        <text fg={Colors.foreground} bold>
          pyne-worker
        </text>
        <text fg={color}>{loading ? "…" : status.toUpperCase()}</text>
        {result?.latencyMs != null ? (
          <text fg={Colors.muted} dim>
            {result.latencyMs}ms
          </text>
        ) : null}
        {result?.error ? (
          <text fg={Colors.error} dim>
            {result.error.slice(0, 40)}
          </text>
        ) : null}
      </box>
    </box>
  );
}
