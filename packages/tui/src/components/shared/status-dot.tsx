/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * StatusDot — a compact color-coded indicator for operational state.
 *
 * Renders a distinct terminal character per status:
 *   - operational → "█" green  (WorkerStatusColor.operational)
 *   - degraded    → "▌" amber  (WorkerStatusColor.degraded)
 *   - down        → "░" red    (WorkerStatusColor.down), dimmed
 *
 * Optional `pulse` blinks the character for operational status
 * (uses the Text `blink` attribute to pulse).
 */
import { WorkerStatusColor } from "@hoox-sh/hoox-shared";

// ── Types ──────────────────────────────────────────────────────────────────

export type StatusDotStatus = "operational" | "degraded" | "down";

export interface StatusDotProps {
  /** The operational status to display */
  status: StatusDotStatus;
  /** Whether to pulse/blink the indicator (only visible on 'operational') */
  pulse?: boolean;
}

// ── Character & color lookup ───────────────────────────────────────────────

const DOT_CHAR: Record<StatusDotStatus, string> = {
  operational: "█",
  degraded: "▌",
  down: "░",
};

const DOT_COLOR = WorkerStatusColor;

// ── Component ──────────────────────────────────────────────────────────────

export function StatusDot({ status, pulse = false }: StatusDotProps) {
  const char = DOT_CHAR[status];
  const color = DOT_COLOR[status];
  const isDown = status === "down";
  const shouldBlink = pulse && status === "operational";

  return (
    <text fg={color} bold={!isDown} dim={isDown} blink={shouldBlink}>
      {char}
    </text>
  );
}
